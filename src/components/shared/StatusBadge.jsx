import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Check, AlertTriangle, X } from "lucide-react";

export default function StatusBadge({ status, showIcon = true }) {
  const config = {
    good: {
      label: "עומד ביעדים",
      className: "bg-emerald-100 text-emerald-700 border-emerald-200",
      icon: Check
    },
    partial: {
      label: "חריג חלקית",
      className: "bg-amber-100 text-amber-700 border-amber-200",
      icon: AlertTriangle
    },
    bad: {
      label: "לא ממלא",
      className: "bg-red-100 text-red-700 border-red-200",
      icon: X
    }
  };

  const { label, className, icon: Icon } = config[status] || config.bad;

  return (
    <Badge variant="outline" className={`${className} gap-1 font-medium`}>
      {showIcon && <Icon className="w-3 h-3" />}
      {label}
    </Badge>
  );
}