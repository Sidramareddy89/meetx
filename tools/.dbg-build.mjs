import { build } from 'esbuild';
import { resolve } from 'node:path';

const shim = resolve('tools/react-hook-shim.mjs');
const auth = resolve('tools/auth-context-stub.mjs');
const ns = 'meetx-stub';

const STUBS = {
  'router-stub': `export const useNavigate=()=>()=>{};export const useParams=()=>({});export const Link=({children})=>children;export const NavLink=({children})=>children;`,
  'react-dom-stub': `export const createPortal=(children,container)=>{globalThis.__meetxPortalContainer=container;return children;};export default {createPortal};`,
};

await build({
  entryPoints: ['tools/desktop-assistant-window.test.mjs'],
  outfile: 'tools/.dbg-bundle.mjs',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  logLevel: 'warning',
  plugins: [{
    name: 'dbg',
    setup(a) {
      a.onResolve({ filter: /^react$/ }, () => ({ path: shim }));
      a.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: shim }));
      a.onResolve({ filter: /^react-dom$/ }, () => ({ path: 'react-dom-stub', namespace: ns }));
      a.onResolve({ filter: /AuthContext$/ }, () => ({ path: auth }));
      a.onResolve({ filter: /^react-router-dom$/ }, () => ({ path: 'router-stub', namespace: ns }));
      a.onResolve({ filter: /^lucide-react$/ }, () => ({ path: 'icon-stub', namespace: ns }));
      a.onResolve({ filter: /^(firebase\/.*|\.\.\/config\/firebase)$/ }, () => ({ path: 'firebase-stub', namespace: ns }));
      a.onLoad({ filter: /.*/, namespace: ns }, ({ path }) => {
        if (path === 'icon-stub') {
          return { contents: ['ArrowRight','Bell','CalendarClock','Check','ChevronDown','ChevronUp','Clock','Copy','CreditCard','Eye','EyeOff','FileText','Languages','Layers','Lightbulb','ListChecks','Loader2','Maximize2','MessageSquare','Mic','Minimize2','MoreHorizontal','Paperclip','PictureInPicture','Play','Plus','RotateCcw','Send','ShieldCheck','Sparkles','Square','Trash2','Users','Video','Volume2','VolumeX','XCircle'].map((n) => `export const ${n}=()=>null;`).join('\n'), loader: 'js' };
        }
        if (path === 'firebase-stub') {
          return { contents: `export const app={};export const auth={};export const db={};export const storage={};export const appCheck=null;export const isFirebaseConfigured=()=>globalThis.__firebaseConfigured===true;export const collection=(...a)=>({path:a.slice(1).join('/')});export const doc=(...a)=>({path:a.slice(1).join('/')});export const where=(f,o,v)=>({__where:{field:f,op:o,value:v}});export const orderBy=(f,d)=>({__orderBy:{field:f,dir:d}});export const query=(t,...c)=>({path:t.path,__where:c.filter(x=>x.__where).map(x=>x.__where),__orderBy:c.filter(x=>x.__orderBy).map(x=>x.__orderBy)});export const serverTimestamp=()=>'ts';export const setDoc=async()=>{};export const getDoc=async()=>({exists:()=>false,data:()=>undefined});export const getDocs=async()=>({forEach:()=>{},docs:()=>[]});export const deleteDoc=async()=>{};export const ref=(_s,p)=>({path:p});export const uploadBytes=async()=>({});export const getDownloadURL=async()=>'';`, loader: 'js' };
        }
        return { contents: STUBS[path] || '', loader: 'js' };
      });
    },
  }],
});
console.log('built');
