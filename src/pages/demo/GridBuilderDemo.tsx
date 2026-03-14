import React, { useState, useCallback } from 'react';
import GridLayout, { useContainerWidth, type LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import type { TodoItemStatus } from '../../types';
import { TaskRowCard } from '../../components/project/TaskRowCard';

/** Initial layout: [12], [6,6], [4,4,4] → RGL units (x, y, w, h) */
const initialLayout: LayoutItem[] = [
  { i: 'a', x: 0, y: 0, w: 12, h: 1 },
  { i: 'b', x: 0, y: 1, w: 6, h: 1 },
  { i: 'c', x: 6, y: 1, w: 6, h: 1 },
  { i: 'd', x: 0, y: 2, w: 4, h: 3 },
  { i: 'e', x: 4, y: 2, w: 4, h: 2 },
  { i: 'f', x: 8, y: 2, w: 4, h: 1 },
];

type TaskRowState = { text: string; status: TodoItemStatus; dueDate?: string; description?: string };

export default function GridBuilderDemo() {
  const [layout, setLayout] = useState<LayoutItem[]>(initialLayout);
  const { width, containerRef, mounted } = useContainerWidth({
    initialWidth: 896,
  });

  const [taskRows, setTaskRows] = useState<TaskRowState[]>([
    { text: '', status: 'todo', dueDate: undefined, description: undefined },
    { text: '', status: 'doing', dueDate: undefined, description: undefined },
    { text: '', status: 'done', dueDate: undefined, description: undefined },
  ]);

  const handleLayoutChange = useCallback((newLayout: readonly LayoutItem[]) => {
    setLayout([...newLayout]);
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-10">
      <h1 className="text-2xl font-semibold text-[var(--color-text)] mb-2">
        Grid Builder Demo (react-grid-layout)
      </h1>

      {/* Task Row Card — component จากหน้า Project (รายการ รอทำ / กำลังทำ / เสร็จ) */}
      <section>
        <h2 className="text-lg font-medium text-[var(--color-text)] mb-2">
          Task Row Card (รอทำ · กำลังทำ · เสร็จ)
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-4">
          Component แถวรายการแบบเดียวกับในหน้า Project — แก้ข้อความ สถานะ Due date และ Memo/Note ได้
        </p>
        <div className="rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)] overflow-hidden min-w-0">
          <div className="space-y-1.5 min-w-0">
            {taskRows.map((row, index) => (
              <TaskRowCard
                key={index}
                index={index + 1}
                text={row.text}
                status={row.status}
                dueDate={row.dueDate}
                description={row.description}
                onTextChange={(value) =>
                  setTaskRows((prev) => {
                    const next = [...prev];
                    next[index] = { ...next[index], text: value };
                    return next;
                  })
                }
                onStatusChange={(status) =>
                  setTaskRows((prev) => {
                    const next = [...prev];
                    next[index] = { ...next[index], status };
                    return next;
                  })
                }
                onDueDateChange={(dueDate) =>
                  setTaskRows((prev) => {
                    const next = [...prev];
                    next[index] = { ...next[index], dueDate };
                    return next;
                  })
                }
                onDescriptionChange={(description) =>
                  setTaskRows((prev) => {
                    const next = [...prev];
                    next[index] = { ...next[index], description };
                    return next;
                  })
                }
              />
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium text-[var(--color-text)] mb-2">
          Grid (react-grid-layout)
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-6">
          ลากการ์ดเพื่อจัดเรียง · cols=12, rowHeight=80 · layout pack อัตโนมัติ
        </p>

        <div ref={containerRef} className="min-h-[400px]">
          {mounted && (
            <GridLayout
              width={width}
              layout={layout}
              onLayoutChange={handleLayoutChange}
              onDragStop={(newLayout: readonly LayoutItem[]) => {
                handleLayoutChange(newLayout);
              }}
              onResizeStop={(newLayout: readonly LayoutItem[]) => {
                handleLayoutChange(newLayout);
              }}
              gridConfig={{ cols: 12, rowHeight: 80, margin: [12, 12], containerPadding: [0, 0] }}
              className="rounded-xl"
            >
              <div key="a" className="rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center font-medium text-[var(--color-text)]">
                A
              </div>
              <div key="b" className="rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center font-medium text-[var(--color-text)]">
                B
              </div>
              <div key="c" className="rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center font-medium text-[var(--color-text)]">
                C
              </div>
              <div key="d" className="rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center font-medium text-[var(--color-text)]">
                D
              </div>
              <div key="e" className="rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center font-medium text-[var(--color-text)]">
                E
              </div>
              <div key="f" className="rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center font-medium text-[var(--color-text)]">
                F
              </div>
            </GridLayout>
          )}
        </div>

        <div className="mt-6 p-4 rounded-xl bg-[var(--color-overlay)] text-sm text-[var(--color-text-muted)]">
          <strong className="text-[var(--color-text)]">react-grid-layout</strong> — ลากการ์ดเพื่อจัดเรียง ระบบจะ pack แถวใหม่อัตโนมัติ (vertical compaction).
        </div>
      </section>
    </div>
  );
}
