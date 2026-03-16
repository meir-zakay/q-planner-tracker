import React, { useMemo } from 'react';

const FALLBACK_COLORS = ['#6366f1','#0ea5e9','#f59e0b','#10b981','#f43f5e','#8b5cf6','#f97316'];

export default function TeamGanttChart({ teams, planEntries, features, sprints, objectives = [] }) {
  const colorMap = useMemo(() => {
    const m = {};
    objectives.forEach(o => { m[o.name] = o.color; });
    return m;
  }, [objectives]);

  const featureMap = useMemo(() => {
    const m = {};
    features.forEach(f => { m[f.id] = f; });
    return m;
  }, [features]);

  // For each feature that has any allocation, compute which sprints it spans
  const rows = useMemo(() => {
    if (!sprints.length || !planEntries.length) return [];

    // Deduplicate by feature_id — merge allocations across teams
    const byFeature = {};
    planEntries.forEach(entry => {
      const fid = entry.feature_id;
      if (!byFeature[fid]) {
        byFeature[fid] = { feature_id: fid, sprintSet: new Set() };
      }
      entry.sprint_allocations?.forEach(a => {
        if ((a.be_weeks || 0) + (a.fe_weeks || 0) > 0) {
          byFeature[fid].sprintSet.add(a.sprint);
        }
      });
    });

    return Object.values(byFeature)
      .map(({ feature_id, sprintSet }) => {
        const feat = featureMap[feature_id];
        if (!feat || sprintSet.size === 0) return null;
        const activeSprints = sprints.filter(s => sprintSet.has(s));
        const startIdx = sprints.indexOf(activeSprints[0]);
        const endIdx = sprints.indexOf(activeSprints[activeSprints.length - 1]);
        return { feat, startIdx, endIdx };
      })
      .filter(Boolean)
      .sort((a, b) => (a.feat.priority || 999) - (b.feat.priority || 999));
  }, [planEntries, features, sprints, featureMap]);

  if (!sprints.length || rows.length === 0) {
    return (
      <div className="rounded-xl p-5 bg-slate-50 dark:bg-[#1a1530] border border-border">
        <h3 className="font-semibold text-foreground mb-2">Quarter Timeline</h3>
        <div className="text-center py-12 text-muted-foreground text-sm">No timeline data available for this quarter</div>
      </div>
    );
  }

  const numSprints = sprints.length;

  return (
    <div className="rounded-xl p-5 bg-slate-50 dark:bg-[#1a1530] border border-border overflow-x-auto">
      <h3 className="font-semibold text-foreground mb-4">Quarter Timeline</h3>
      <div style={{ minWidth: Math.max(600, numSprints * 60 + 200) }}>
        {/* Sprint header */}
        <div className="flex" style={{ marginLeft: 180 }}>
          {sprints.map(s => (
            <div
              key={s}
              className="flex-1 text-center text-[11px] font-semibold text-muted-foreground border-r border-border py-1.5 first:rounded-tl-lg last:rounded-tr-lg last:border-r-0 bg-muted/40"
            >
              {s}
            </div>
          ))}
        </div>

        {/* Feature rows */}
        {rows.map(({ feat, startIdx, endIdx }, rowIdx) => {
          const barSpan = endIdx - startIdx + 1;
          const barWidthPct = (barSpan / numSprints) * 100;
          const barOffsetPct = (startIdx / numSprints) * 100;

          return (
            <div
              key={feat.id}
              className="flex items-center border-b border-border/40 last:border-b-0"
              style={{ height: 40 }}
            >
              {/* Feature label */}
              <div
                className="shrink-0 flex items-center px-3 text-[11px] font-medium text-foreground truncate bg-muted/20 border-r border-border/40"
                style={{ width: 180, height: '100%' }}
                title={feat.title}
              >
                <span className="truncate">{feat.title}</span>
              </div>

              {/* Sprint grid + bar */}
              <div className="flex-1 relative" style={{ height: '100%' }}>
                {/* Grid lines */}
                <div className="absolute inset-0 flex">
                  {sprints.map(s => (
                    <div
                      key={s}
                      className="flex-1 border-r border-border/20 last:border-r-0 h-full"
                      style={{ backgroundColor: rowIdx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)' }}
                    />
                  ))}
                </div>

                {/* Bar */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 rounded-sm"
                  style={{
                    left: `calc(${barOffsetPct}% + 2px)`,
                    width: `calc(${barWidthPct}% - 4px)`,
                    height: 20,
                    backgroundColor: colorMap[feat.objective] || FALLBACK_COLORS[rowIdx % FALLBACK_COLORS.length],
                    opacity: 0.55,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      {Object.keys(colorMap).length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4">
          {Object.entries(colorMap).map(([name, color]) => (
            <div key={name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}