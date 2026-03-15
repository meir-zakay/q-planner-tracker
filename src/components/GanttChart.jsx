import React, { useMemo } from 'react';

export default function GanttChart({ entries, featureMap, sprints, colorMap }) {
  const chartData = useMemo(() => {
    return entries
      .filter(entry => {
        const hasAlloc = entry.sprint_allocations?.some(a => (a.be_weeks || 0) + (a.fe_weeks || 0) > 0);
        return hasAlloc;
      })
      .map(entry => {
        const feat = featureMap[entry.feature_id];
        const activeSprints = sprints
          .map((s, idx) => {
            const alloc = entry.sprint_allocations?.find(a => a.sprint === s);
            const hasEffort = (alloc?.be_weeks || 0) + (alloc?.fe_weeks || 0) > 0;
            return hasEffort ? idx : null;
          })
          .filter(idx => idx !== null);

        if (activeSprints.length === 0) return null;

        return {
          id: entry.id,
          title: feat?.title || 'Unknown Feature',
          objective: feat?.objective,
          startIdx: Math.min(...activeSprints),
          endIdx: Math.max(...activeSprints),
          span: Math.max(...activeSprints) - Math.min(...activeSprints) + 1,
        };
      })
      .filter(Boolean);
  }, [entries, featureMap, sprints]);

  if (chartData.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No sprint allocations to display</p>;
  }

  const numSprints = sprints.length;
  const cellWidth = Math.max(40, 100 / numSprints);

  return (
    <div className="rounded-xl p-5 bg-slate-50 dark:bg-[#1a1530] border border-border overflow-x-auto">
      <h3 className="font-semibold text-foreground mb-4">Quarter Timeline</h3>
      
      <div className="min-w-max">
        {/* Header with sprint names */}
        <div className="flex items-start">
          <div className="w-48 shrink-0" />
          <div className="flex">
            {sprints.map((sprint) => (
              <div
                key={sprint}
                className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground border-r border-border/50"
                style={{ width: `${cellWidth}%`, minWidth: '60px' }}
              >
                {sprint}
              </div>
            ))}
          </div>
        </div>

        {/* Feature rows */}
        {chartData.map((item) => (
          <div key={item.id} className="flex items-center border-t border-border/30">
            {/* Feature name */}
            <div className="w-48 shrink-0 px-3 py-2.5 text-sm font-medium text-foreground truncate">
              {item.title}
            </div>

            {/* Gantt bar */}
            <div className="flex flex-1">
              {sprints.map((sprint, idx) => {
                const isInRange = idx >= item.startIdx && idx <= item.endIdx;
                const isStart = idx === item.startIdx;
                const isEnd = idx === item.endIdx;
                const bgColor = item.objective ? colorMap[item.objective] : '#0F52BA';

                return (
                  <div
                    key={sprint}
                    className="border-r border-border/30"
                    style={{ width: `${cellWidth}%`, minWidth: '60px' }}
                  >
                    {isInRange && (
                      <div
                        className={`h-10 flex items-center justify-center text-[10px] font-semibold text-white transition-all ${
                          isStart && isEnd ? 'rounded-lg' : isStart ? 'rounded-l-lg' : isEnd ? 'rounded-r-lg' : ''
                        }`}
                        style={{ backgroundColor: bgColor }}
                        title={item.title}
                      >
                        {item.span === 1 ? '◼' : item.span > 1 && (isStart || isEnd) ? '▶' : ''}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-border/30">
        <p className="text-xs text-muted-foreground mb-2">Objectives:</p>
        <div className="flex flex-wrap gap-3">
          {Object.entries(colorMap).map(([obj, color]) => (
            <div key={obj} className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
              <span className="text-muted-foreground">{obj}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}