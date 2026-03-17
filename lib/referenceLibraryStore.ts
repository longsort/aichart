import type { ReferenceItem, StructureFeatures } from '@/types/reference';
import { referenceLibrary as builtinLibrary } from './referenceLibrary';

const STORAGE_KEY = 'ailongshort-reference-library';

function loadUserRefs(): ReferenceItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveUserRefs(items: ReferenceItem[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function getReferenceLibrary(): ReferenceItem[] {
  const user = loadUserRefs();
  return [...builtinLibrary, ...user];
}

export function addReference(item: Omit<ReferenceItem, 'id'>): ReferenceItem {
  const user = loadUserRefs();
  const id = `user_${Date.now()}`;
  const newItem: ReferenceItem = { ...item, id };
  user.push(newItem);
  saveUserRefs(user);
  return newItem;
}

export function updateReference(id: string, patch: Partial<ReferenceItem>): ReferenceItem | null {
  const user = loadUserRefs();
  const idx = user.findIndex(r => r.id === id);
  if (idx < 0) return null;
  user[idx] = { ...user[idx], ...patch };
  saveUserRefs(user);
  return user[idx];
}

export function deleteReference(id: string): boolean {
  const user = loadUserRefs().filter(r => r.id !== id);
  if (user.length === loadUserRefs().length) return false;
  saveUserRefs(user);
  return true;
}

export function getReferenceById(id: string): ReferenceItem | undefined {
  return getReferenceLibrary().find(r => r.id === id);
}

export const defaultStructureFeatures: StructureFeatures = {
  bos: false,
  choch: false,
  fvg: 0,
  ob: 0,
  sweep: false,
  pattern: '',
  bias: 'neutral',
};
