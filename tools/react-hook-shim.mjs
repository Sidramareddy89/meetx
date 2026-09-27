/**
 * Minimal, faithful React hook runtime for Node-side verification.
 *
 * This mirrors only the parts of React that the recognizer-lifecycle fix
 * depends on, with React's real semantics:
 *   - hooks are stored per component instance, in call order
 *   - `useRef` keeps one mutable cell for the component's lifetime
 *   - `useCallback(fn, deps)` returns the SAME function while deps are
 *     Object.is-equal, and a new function when any dep changes
 *   - `useEffect(effect, deps)` runs the previous cleanup (for changed deps)
 *     before re-running the effect; with no deps array it runs every commit
 *   - state updates schedule a re-render, which is flushed after the commit
 *
 * It is deliberately aliased as the `react` module for the F1 test bundle, so
 * the REAL `src/hooks/useSpeechToText.ts` runs unmodified.
 */

/**
 * One hook store per component instance. A test that renders a parent provider
 * and a child component SEPARATELY (instead of nesting them) switches between
 * named instances so their hook slots cannot collide.
 */
const instances = new Map();
let activeName = 'default';
let instance = { hooks: [], mounted: true };
const activate = (name) => {
  activeName = name;
  if (!instances.has(name)) instances.set(name, { hooks: [], mounted: true });
  instance = instances.get(name);
  return instance;
};
activate('default');
let renderContext = null;
let lastResult = undefined;

const sameDeps = (a, b) =>
  Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

const slotAt = (index) => {
  if (!instance.hooks[index]) instance.hooks[index] = {};
  return instance.hooks[index];
};

export const useState = (initial) => {
  const index = renderContext.index++;
  const slot = slotAt(index);
  if (!('state' in slot)) slot.state = typeof initial === 'function' ? initial() : initial;
  const setState = (next) => {
    const value = typeof next === 'function' ? next(slot.state) : next;
    if (Object.is(value, slot.state)) return;
    slot.state = value;
    // A state update schedules a re-render (flushed after the current commit).
    instance.pendingRender = true;
  };
  return [slot.state, setState];
};

export const useRef = (initial) => {
  const index = renderContext.index++;
  const slot = slotAt(index);
  if (!('ref' in slot)) slot.ref = { current: initial };
  return slot.ref;
};

/** Context values currently supplied by the nearest provider elements. */
const contextStack = [];

export const createContext = (defaultValue) => ({ __isContext: true, defaultValue });

export const useContext = (context) => {
  for (let i = contextStack.length - 1; i >= 0; i -= 1) {
    if (contextStack[i].has(context)) return contextStack[i].get(context);
  }
  return context ? context.defaultValue : undefined;
};

export const useCallback = (fn, deps) => {
  const index = renderContext.index++;
  const slot = slotAt(index);
  if (!slot.callback || !sameDeps(slot.deps, deps)) {
    slot.callback = fn;
    slot.deps = deps;
  }
  return slot.callback;
};

export const useEffect = (effect, deps) => {
  const index = renderContext.index++;
  const slot = slotAt(index);
  const isMount = !slot.effect;
  const shouldRun = isMount || deps === undefined || !sameDeps(slot.deps, deps);
  slot.effect = effect;
  slot.deps = deps;
  if (shouldRun) renderContext.effects.push({ index, effect });
};

const commit = (effects) => {
  for (const { index, effect } of effects) {
    const slot = instance.hooks[index];
    if (typeof slot.cleanup === 'function') slot.cleanup();
    const cleanup = effect();
    slot.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
  }
};

export const __hookTest = {
  /** Render the component (like React), flush effects, then flush re-renders. */
  render(component) {
    let guard = 0;
    let result;
    do {
      instance.pendingRender = false;
      renderContext = { index: 0, effects: [] };
      result = component();
      const effects = renderContext.effects;
      renderContext = null;
      commit(effects);
      result = result;
      if (!instance.pendingRender) break;
    } while (++guard < 20);
    lastResult = result;
    return result;
  },
  /**
   * Make a context value visible to `useContext` for components rendered
   * afterwards, exactly like React's nearest-Provider lookup. Used when a test
   * mounts a child component separately from its real provider.
   */
  provideContext(contextObject, value) {
    contextStack.push(new Map([[contextObject, value]]));
  },
  /** Drop any provided context values (no provider above this component). */
  clearContext() {
    contextStack.length = 0;
  },
  /** Unmount: run every effect cleanup (React's unmount semantics). */
  unmount() {
    for (const slot of instance.hooks) {
      if (slot && typeof slot.cleanup === 'function') {
        slot.cleanup();
        slot.cleanup = undefined;
      }
    }
    instance.mounted = false;
  },
  /** Fresh component instance (the active one). */
  reset() {
    instances.set(activeName, { hooks: [], mounted: true });
    instance = instances.get(activeName);
    lastResult = undefined;
  },
  /**
   * Render the next component under its OWN hook store, so a child rendered
   * separately from its real provider does not reuse the provider's hook slots.
   */
  useInstance(name) {
    return activate(name);
  },
  /** Back to the instance the test started with. */
  defaultInstance() {
    return activate('default');
  },
  lastResult: () => lastResult,
};

// Not used by the hook under test — provided so bundling never fails if React's
// surface grows in the file.
export const createElement = () => null;

// --- jsx runtime (the automatic JSX transform imports `react/jsx-runtime`) ---
// Elements are plain objects: { type, props }. That is enough to mount a
// function component with the shim and inspect the element tree it returns
// (e.g. to read a context Provider's `value`).
export const Fragment = Symbol.for('react.fragment');

export const jsx = (type, props, key) => ({
  type,
  props: key === undefined ? { ...(props || {}) } : { ...(props || {}), key },
});
export const jsxs = jsx;
export const jsxDEV = jsx;

export default {
  useState,
  useRef,
  useCallback,
  useEffect,
  createContext,
  useContext,
  createElement,
  Fragment,
  jsx,
  jsxs,
};
