import React from 'react';
import { AlertTriangle, TrendingUp, Lightbulb, PartyPopper } from 'lucide-react';

/**
 * TraineeActionableSummary
 *
 * Surfaces the backend's deterministic action_item tier on the mini-card.
 * No AI calls — purely derived from the backend's 8-tier priority system.
 *
 * Tiers:
 *   1–2 : urgent (red/amber)   – no report, critical score
 *   3–5 : notice (amber/yellow) – adherence warning, water, app inactivity
 *   6–7 : info (blue/slate)
 *   8   : positive (green)     – celebration
 *   null: nothing rendered
 */
export default function TraineeActionableSummary({ actionItem }) {
  if (!actionItem) return null;

  const { tier, reason, recommended_action } = actionItem;

  // Styling by urgency band
  let style, Icon;
  if (tier <= 2) {
    style = 'bg-red-50 border-red-200 text-red-800';
    Icon  = AlertTriangle;
  } else if (tier <= 5) {
    style = 'bg-amber-50 border-amber-200 text-amber-800';
    Icon  = AlertTriangle;
  } else if (tier === 6 || tier === 7) {
    style = 'bg-blue-50 border-blue-200 text-blue-800';
    Icon  = Lightbulb;
  } else {
    // tier 8 — celebration
    style = 'bg-emerald-50 border-emerald-200 text-emerald-800';
    Icon  = tier === 8 ? PartyPopper : TrendingUp;
  }

  return (
    <div className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 mt-2 ${style}`}>
      <Icon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold leading-tight truncate">{reason}</p>
        {recommended_action && (
          <p className="text-[10px] opacity-70 leading-tight mt-0.5">{recommended_action}</p>
        )}
      </div>
    </div>
  );
}
