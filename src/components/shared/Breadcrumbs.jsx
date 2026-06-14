import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function Breadcrumbs({ items }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-600 mb-4" dir="rtl">
      {items.map((item, idx) => (
        <React.Fragment key={idx}>
          {item.path ? (
            <Link
              to={item.path}
              className="hover:text-slate-800 transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-slate-800 font-medium">{item.label}</span>
          )}
          {idx < items.length - 1 && (
            <ChevronLeft className="w-4 h-4 text-slate-400" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}