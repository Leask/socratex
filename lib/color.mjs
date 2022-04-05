import { ensureString } from './utilitas.mjs';
import style from './style.cjs';

const funcs = { strip: (s, o) => ensureString(s, o).replace(/\x1B\[\d+m/g, '') };

for (let color in style) {
    funcs[color] = (s, o) => `${style[color].open}${ensureString(s, o)}${style[color].close}`;
}

export default funcs;
