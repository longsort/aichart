'use client';

import { useState, useEffect } from 'react';
import {
  getReferenceLibrary,
  addReference,
  updateReference,
  deleteReference,
  defaultStructureFeatures,
} from '@/lib/referenceLibraryStore';
import type { ReferenceItem } from '@/types/reference';

export default function ReferenceManager() {
  const [refs, setRefs] = useState<ReferenceItem[]>([]);
  const [open, setOpen] = useState<'add' | string | null>(null);
  const [form, setForm] = useState({ title: '', tags: '', exampleBriefing: '', patternType: '' });

  const refresh = () => setRefs(getReferenceLibrary());

  useEffect(() => { refresh(); }, [open]);

  const handleSave = () => {
    const tags = form.tags.split(/[\s,]+/).filter(Boolean);
    if (open === 'add') {
      addReference({
        title: form.title || '새 레퍼런스',
        tags,
        patternType: form.patternType || undefined,
        structureFeatures: { ...defaultStructureFeatures },
        exampleBriefing: form.exampleBriefing || undefined,
      });
    } else if (open && open.startsWith('user_')) {
      updateReference(open, {
        title: form.title,
        tags,
        patternType: form.patternType || undefined,
        exampleBriefing: form.exampleBriefing || undefined,
      });
    }
    setOpen(null);
    setForm({ title: '', tags: '', exampleBriefing: '', patternType: '' });
    refresh();
  };

  const handleDelete = (id: string) => {
    if (id.startsWith('user_') && confirm('삭제할까요?')) {
      deleteReference(id);
      setOpen(null);
      refresh();
    }
  };

  const openEdit = (r: ReferenceItem) => {
    setForm({
      title: r.title,
      tags: r.tags.join(', '),
      exampleBriefing: r.exampleBriefing || '',
      patternType: r.patternType || '',
    });
    setOpen(r.id);
  };

  return (
    <div className="card panel-pad">
      <div className="space-between">
        <div className="section-title">레퍼런스 라이브러리</div>
        <button type="button" className="tool-chip tool-chip-button" onClick={() => { setForm({ title: '', tags: '', exampleBriefing: '', patternType: '' }); setOpen('add'); }}>
          추가
        </button>
      </div>
      {(open === 'add' || (open && open.startsWith('user_'))) && (
        <div style={{ marginTop: 10, padding: 10, background: 'var(--panel2)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <input placeholder="제목" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="select-pill" style={{ width: '100%', marginBottom: 6 }} />
          <input placeholder="태그 (쉼표 구분)" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} className="select-pill" style={{ width: '100%', marginBottom: 6 }} />
          <input placeholder="패턴 타입" value={form.patternType} onChange={e => setForm(f => ({ ...f, patternType: e.target.value }))} className="select-pill" style={{ width: '100%', marginBottom: 6 }} />
          <textarea placeholder="예시 브리핑" value={form.exampleBriefing} onChange={e => setForm(f => ({ ...f, exampleBriefing: e.target.value }))} className="select-pill" style={{ width: '100%', minHeight: 60 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" className="tool-chip tool-chip-button" onClick={handleSave}>저장</button>
            <button type="button" className="tool-chip tool-chip-button" onClick={() => setOpen(null)}>취소</button>
            {open && open.startsWith('user_') && <button type="button" className="tool-chip tool-chip-button" style={{ color: '#ff7b7b' }} onClick={() => handleDelete(open)}>삭제</button>}
          </div>
        </div>
      )}
      <div className="list" style={{ marginTop: 10 }}>
        {refs.map(r => (
          <div key={r.id} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>{r.title}</strong>
              <div className="subtle">{r.tags.join(', ')}</div>
            </div>
            {r.id.startsWith('user_') && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" className="tool-chip tool-chip-button" onClick={() => openEdit(r)}>수정</button>
                <button type="button" className="tool-chip tool-chip-button" style={{ color: '#ff7b7b' }} onClick={() => handleDelete(r.id)}>삭제</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
