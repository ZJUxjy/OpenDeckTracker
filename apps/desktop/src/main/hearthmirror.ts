import { HearthMirror } from '@hdt/hearthmirror';

let instance: HearthMirror | null = null;

export function getHearthMirror(): HearthMirror {
  if (!instance) {
    instance = new HearthMirror();
  }
  return instance;
}
