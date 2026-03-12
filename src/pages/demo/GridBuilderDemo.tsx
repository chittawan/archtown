import React, { useState, useCallback } from 'react';
import GridLayout, { useContainerWidth, type LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

/** Initial layout: [12], [6,6], [4,4,4] → RGL units (x, y, w, h) */
const initialLayout: LayoutItem[] = [
  { i: 'a', x: 0, y: 0, w: 12, h: 1 },
  { i: 'b', x: 0, y: 1, w: 6, h: 1 },
  { i: 'c', x: 6, y: 1, w: 6, h: 1 },
  { i: 'd', x: 0, y: 2, w: 4, h: 3 }, // D สูง 3 เท่า
  { i: 'e', x: 4, y: 2, w: 4, h: 2 }, // E สูง 2 เท่า
  { i: 'f', x: 8, y: 2, w: 4, h: 1 },
];

export default function GridBuilderDemo() {
  const [layout, setLayout] = useState<LayoutItem[]>(initialLayout);
  const { width, containerRef, mounted } = useContainerWidth({
    initialWidth: 896,
  });

  const handleLayoutChange = useCallback((newLayout: readonly LayoutItem[]) => {
    setLayout([...newLayout]);
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-semibold text-[var(--color-text)] mb-2">
        Grid Builder Demo (react-grid-layout)
      </h1>
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

      <div className="mt-8 p-4 rounded-xl bg-[var(--color-overlay)] text-sm text-[var(--color-text-muted)]">
        <strong className="text-[var(--color-text)]">react-grid-layout</strong> — ลาก A (col-12) ลงมา ระบบจะ pack แถวใหม่อัตโนมัติ (vertical compaction).
      </div>
    </div>
  );
}
