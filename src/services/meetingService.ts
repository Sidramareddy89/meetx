import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, isFirebaseConfigured } from '../config/firebase';
import { Meeting, MeetingResource } from '../types/meeting';

/**
 * Phase 4: keep local persistence quota-safe.
 * When Firebase Storage is not configured, resource files are inlined as
 * data URLs. Large data URLs would overflow localStorage, so anything over
 * this size is kept in memory for the live session only (metadata persists).
 */
const MAX_LOCAL_RESOURCE_URL_CHARS = 250 * 1024; // ~250 KB

const trimResourceForLocalPersistence = (resource: MeetingResource): MeetingResource => {
  if (resource.url && resource.url.length > MAX_LOCAL_RESOURCE_URL_CHARS) {
    return {
      id: resource.id,
      name: resource.name,
      type: resource.type,
      size: resource.size,
    };
  }
  return { ...resource };
};

const slimResourcesForLocalPersistence = (resources?: MeetingResource[]): MeetingResource[] =>
  (resources || []).map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    size: r.size,
  }));

/**
 * F2: the ONE authoritative meeting-ID generator for the whole application.
 *
 * A single id is created per meeting (HomePage) and then reused everywhere:
 * live session state, the localStorage record, the `meetings/{id}` Firestore
 * document, the resource storage path, every transcript flush and the final
 * completion write. No other code may generate a meeting id.
 *
 * The existing `meet-<epoch-ms>` format is preserved; a monotonic suffix is
 * added only when two ids would otherwise be generated in the same
 * millisecond, so two distinct meetings can never share an id.
 */
let lastMeetingIdTimestamp = 0;
let sameMillisecondIdSuffix = 0;

export const createMeetingId = (): string => {
  const now = Date.now();
  if (now === lastMeetingIdTimestamp) {
    sameMillisecondIdSuffix += 1;
  } else {
    lastMeetingIdTimestamp = now;
    sameMillisecondIdSuffix = 0;
  }
  return sameMillisecondIdSuffix === 0 ? `meet-${now}` : `meet-${now}-${sameMillisecondIdSuffix}`;
};

/**
 * Upload a resource file for a meeting to Firebase Storage.
 * Includes local base64 fallback for environments without live Storage buckets.
 */
export async function uploadMeetingResourceFile(
  userId: string,
  meetingId: string,
  file: File
): Promise<MeetingResource> {
  const resourceId = 'res-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);

  if (isFirebaseConfigured()) {
    try {
      const storageRef = ref(storage, `users/${userId}/meetings/${meetingId}/resources/${file.name}`);
      const uploadResult = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(uploadResult.ref);

      return {
        id: resourceId,
        name: file.name,
        url: downloadUrl,
        size: file.size,
        type: file.type || 'document',
      };
    } catch (err) {
      console.warn('Firebase Storage upload failed, falling back to local encoding:', err);
    }
  }

  // Local Data URL fallback
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        id: resourceId,
        name: file.name,
        url: (reader.result as string) || '',
        size: file.size,
        type: file.type || 'document',
        content: file.name,
      });
    };
    reader.onerror = () => {
      resolve({
        id: resourceId,
        name: file.name,
        size: file.size,
        type: file.type || 'document',
      });
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Save meeting metadata and resource links to Firestore associated with the authenticated user.
 */
export async function saveMeeting(
  userId: string,
  meetingData: Omit<Meeting, 'id' | 'userId' | 'createdAt'>,
  customId?: string
): Promise<Meeting> {
  const meetingId = customId || createMeetingId();
  const incomingTranscript = meetingData.transcript || [];
  const meeting: Meeting = {
    ...meetingData,
    id: meetingId,
    userId,
    createdAt: Date.now(),
    transcript: incomingTranscript,
    status: meetingData.status || 'live',
  };

  // F3: an initial save always carries `transcript: []`. If the live-transcript
  // debounce already persisted remarks for this same meeting id, keep them
  // instead of replacing them with the empty array.
  let transcriptToPersist = incomingTranscript;
  try {
    const rawExisting = localStorage.getItem(`meetx_meetings_${userId}`);
    if (rawExisting) {
      const storedList: Meeting[] = JSON.parse(rawExisting);
      const stored = storedList.find((m) => m.id === meetingId && m.userId === userId);
      if (incomingTranscript.length === 0 && stored && (stored.transcript || []).length > 0) {
        transcriptToPersist = stored.transcript;
      }
    }
  } catch (readErr) {
    console.warn('Local meeting read warning:', readErr);
  }

  // 1. Sync to local user storage for reload resilience (quota-safe)
  try {
    const localKey = `meetx_meetings_${userId}`;
    const persistMeeting: Meeting = {
      ...meeting,
      transcript: transcriptToPersist,
      resources: (meeting.resources || []).map(trimResourceForLocalPersistence),
    };
    const existingRaw = localStorage.getItem(localKey);
    const existingList: Meeting[] = existingRaw ? JSON.parse(existingRaw) : [];
    const updatedList = [persistMeeting, ...existingList.filter((m) => m.id !== meetingId)];
    try {
      localStorage.setItem(localKey, JSON.stringify(updatedList));
    } catch (quotaErr) {
      // QuotaExceeded: retry with metadata-only resources so the meeting record
      // (and its user association) is never lost.
      const slimmedList = updatedList.map((m) => ({
        ...m,
        resources: slimResourcesForLocalPersistence(m.resources),
      }));
      localStorage.setItem(localKey, JSON.stringify(slimmedList));
      console.warn('Local storage quota exceeded; stored resource metadata only:', quotaErr);
    }
  } catch (localErr) {
    console.warn('Local storage sync warning:', localErr);
  }

  // 2. Persist to Firestore if configured
  if (isFirebaseConfigured()) {
    try {
      const meetingRef = doc(db, 'meetings', meetingId);
      // F3: merge (never a full replace) and omit an empty transcript, so a late
      // initial save can never blank remarks already written by the debounce.
      const firestorePayload: Record<string, unknown> = {
        ...meeting,
        serverCreatedAt: serverTimestamp(),
      };
      if (transcriptToPersist.length > 0) {
        firestorePayload.transcript = transcriptToPersist;
      } else {
        delete firestorePayload.transcript;
      }
      await setDoc(meetingRef, firestorePayload, { merge: true });

      // Also create reference inside user sub-collection for fast querying
      const userMeetingRef = doc(db, 'users', userId, 'meetings', meetingId);
      await setDoc(userMeetingRef, {
        meetingId,
        topic: meeting.topic,
        platform: meeting.platform,
        createdAt: meeting.createdAt,
      });
    } catch (fsErr) {
      console.warn('Firestore meeting save warning:', fsErr);
    }
  }

  return meeting;
}

/**
 * Retrieve a specific meeting by ID and verify association with the authenticated user.
 */
export async function getMeetingById(
  meetingId: string,
  userId: string
): Promise<Meeting | null> {
  // 1. Try Firestore if configured
  if (isFirebaseConfigured()) {
    try {
      const docRef = doc(db, 'meetings', meetingId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as Meeting;
        // Verify user association
        if (data.userId === userId) {
          return data;
        }
      }
    } catch (fsErr) {
      console.warn('Firestore retrieval warning:', fsErr);
    }
  }

  // 2. Fallback to user's local meetings store
  try {
    const localKey = `meetx_meetings_${userId}`;
    const existingRaw = localStorage.getItem(localKey);
    if (existingRaw) {
      const list: Meeting[] = JSON.parse(existingRaw);
      const found = list.find((m) => m.id === meetingId && m.userId === userId);
      if (found) return found;
    }
  } catch (localErr) {
    console.warn('Local retrieval warning:', localErr);
  }

  return null;
}

/**
 * Retrieve all meetings belonging to the authenticated user.
 */
export async function getUserMeetings(userId: string): Promise<Meeting[]> {
  // 1. Try Firestore if configured
  if (isFirebaseConfigured()) {
    try {
      const q = query(
        collection(db, 'meetings'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const meetings: Meeting[] = [];
      snapshot.forEach((d) => {
        meetings.push(d.data() as Meeting);
      });
      if (meetings.length > 0) {
        return meetings;
      }
    } catch (fsErr) {
      console.warn('Firestore query warning:', fsErr);
    }
  }

  // 2. Fallback to local storage for user
  try {
    const localKey = `meetx_meetings_${userId}`;
    const raw = localStorage.getItem(localKey);
    if (raw) {
      const list: Meeting[] = JSON.parse(raw);
      return list.filter((m) => m.userId === userId);
    }
  } catch (err) {
    console.warn('Local user meetings parse error:', err);
  }

  return [];
}

/**
 * Phase 8: update the stored record of an existing meeting (transcript,
 * status, duration...) while verifying user association. Works against
 * Firestore when configured and the per-user local store in all cases.
 *
 * F2/F3: `fallbackMeeting` is the authoritative live-session snapshot. Because
 * HomePage persists the meeting in the background, a transcript flush can
 * arrive before the record exists — the snapshot lets that flush create the
 * record instead of being dropped, and it is only ever used for the SAME
 * meeting id, so no duplicate meeting can be produced.
 */
export async function updateStoredMeeting(
  meetingId: string,
  userId: string,
  updates: Partial<Pick<Meeting, 'transcript' | 'status' | 'duration'>>,
  fallbackMeeting?: Meeting
): Promise<void> {
  // 1. Local store (source of truth when Firebase is unconfigured)
  try {
    const localKey = `meetx_meetings_${userId}`;
    const raw = localStorage.getItem(localKey);
    const list: Meeting[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((m) => m.id === meetingId && m.userId === userId);
    let hasChanges = false;

    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updates };
      hasChanges = true;
    } else if (fallbackMeeting && fallbackMeeting.id === meetingId) {
      // The stored record is still in flight from the initial save — write the
      // flush against the session snapshot rather than silently doing nothing.
      list.unshift({ ...fallbackMeeting, userId, ...updates });
      hasChanges = true;
    }

    if (hasChanges) {
      try {
        localStorage.setItem(localKey, JSON.stringify(list));
      } catch (quotaErr) {
        // Quota fallback: drop resource dataURLs (metadata only), keep transcript.
        const slimmed = list.map((m) => ({
          ...m,
          resources: slimResourcesForLocalPersistence(m.resources),
        }));
        localStorage.setItem(localKey, JSON.stringify(slimmed));
        console.warn('Local storage quota exceeded during meeting update:', quotaErr);
      }
    }
  } catch (localErr) {
    console.warn('Local meeting update warning:', localErr);
  }

  // 2. Firestore when configured. `setDoc(..., { merge: true })` instead of
  //    `updateDoc(...)`: a transcript flush may arrive before the initial save
  //    has created the document, and updateDoc fails on a missing document —
  //    which used to drop the transcript entirely.
  if (isFirebaseConfigured()) {
    try {
      await setDoc(
        doc(db, 'meetings', meetingId),
        { ...updates, userId, serverUpdatedAt: serverTimestamp() },
        { merge: true }
      );
    } catch (fsErr) {
      console.warn('Firestore meeting update warning:', fsErr);
    }
  }
}

/**
 * Permanently delete a meeting: removes it from the per-user local store
 * and from Firestore (when configured). The remote delete is best-effort so
 * a permissions issue on one side never blocks the other.
 */
export async function deleteMeeting(meetingId: string, userId: string): Promise<void> {
  // 1. Local store (always kept in sync with the UI list)
  try {
    const localKey = `meetx_meetings_${userId}`;
    const raw = localStorage.getItem(localKey);
    if (raw) {
      const list: Meeting[] = JSON.parse(raw);
      const next = list.filter((m) => !(m.id === meetingId && m.userId === userId));
      localStorage.setItem(localKey, JSON.stringify(next));
    }
  } catch (localErr) {
    console.warn('Local meeting delete warning:', localErr);
  }

  // 2. Firestore when configured
  if (isFirebaseConfigured()) {
    try {
      await deleteDoc(doc(db, 'meetings', meetingId));
    } catch (fsErr) {
      console.warn('Firestore meeting delete warning:', fsErr);
    }
  }
}
