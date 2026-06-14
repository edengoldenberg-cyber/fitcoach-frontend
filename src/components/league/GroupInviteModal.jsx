import React, { useState } from 'react';
import { X, Copy, Share2, Check, Users, Lock } from 'lucide-react';

// Generates a stable 6-char invite code from group id
function getInviteCode(groupId) {
  return (groupId || '').slice(-8).toUpperCase().replace(/[^A-Z0-9]/g, 'X').padEnd(6, '0').slice(0, 6);
}

function getInviteLink(groupId) {
  const base = window.location.origin;
  return `${base}/ShapeLeagueHome?joinGroup=${groupId}&code=${getInviteCode(groupId)}`;
}

export default function GroupInviteModal({ group, onClose }) {
  const [copied, setCopied] = useState(false);

  if (!group) return null;

  const code = getInviteCode(group.id);
  const link = getInviteLink(group.id);
  const groupName = group.display_name || group.name || 'הקבוצה שלי';
  const badge = group.badge_icon || '🔥';
  const isFull = (group.members?.length || 0) >= (group.max_members || 5);
  const slotsLeft = (group.max_members || 5) - (group.members?.length || 0);

  const handleCopy = () => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(
      `${badge} הוזמנת להצטרף לקבוצה *${groupName}* ב-Shape League! 🏆\n\n` +
      `קוד הצטרפות: *${code}*\n` +
      `${link}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-slate-800 border border-slate-600 rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{badge}</span>
            <div>
              <h3 className="text-white font-bold text-lg">הזמן לקבוצה</h3>
              <p className="text-slate-400 text-xs">{groupName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white min-h-0 min-w-0 w-8 h-8">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isFull ? (
          <div className="text-center py-6 space-y-2">
            <Lock className="w-10 h-10 text-slate-500 mx-auto" />
            <p className="text-white font-semibold">הקבוצה מלאה</p>
            <p className="text-slate-400 text-sm">אין מקום פנוי כרגע (5/5)</p>
          </div>
        ) : (
          <>
            {/* Slots remaining */}
            <div className="flex items-center justify-center gap-2 mb-5">
              <Users className="w-4 h-4 text-teal-400" />
              <span className="text-teal-300 text-sm font-medium">
                {slotsLeft} {slotsLeft === 1 ? 'מקום פנוי' : 'מקומות פנויים'}
              </span>
            </div>

            {/* Invite Code */}
            <div className="bg-slate-700 border border-slate-600 rounded-2xl p-4 mb-4 text-center">
              <p className="text-slate-400 text-xs mb-2">קוד הצטרפות</p>
              <p className="text-4xl font-black text-yellow-400 tracking-widest font-mono">{code}</p>
              <p className="text-slate-500 text-xs mt-2">שתף עם חברים שרוצים להצטרף</p>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              {/* WhatsApp Share */}
              <button
                onClick={handleWhatsApp}
                className="w-full flex items-center justify-center gap-3 bg-green-600 hover:bg-green-500 text-white font-bold py-3.5 rounded-2xl transition-colors min-h-0"
              >
                <Share2 className="w-5 h-5" />
                שתף בוואטסאפ
              </button>

              {/* Copy Link */}
              <button
                onClick={handleCopy}
                className={`w-full flex items-center justify-center gap-3 border font-bold py-3.5 rounded-2xl transition-all min-h-0 ${
                  copied
                    ? 'bg-teal-500/20 border-teal-400 text-teal-300'
                    : 'bg-slate-700 border-slate-600 text-white hover:border-teal-400'
                }`}
              >
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                {copied ? 'הקישור הועתק!' : 'העתק קישור'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}