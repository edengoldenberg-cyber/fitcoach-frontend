import React from 'react';
import { Button } from "@/components/ui/button";

export default function QuickActionButton({ icon: Icon, label, onClick, variant = "default" }) {
  const variants = {
    default: "bg-white border-slate-200 text-slate-700 hover:bg-slate-50",
    primary: "bg-emerald-500 border-emerald-500 text-white hover:bg-emerald-600",
    secondary: "bg-blue-500 border-blue-500 text-white hover:bg-blue-600",
  };

  return (
    <Button
      onClick={onClick}
      variant="outline"
      className={`flex-1 h-auto py-4 px-3 flex flex-col items-center gap-2 ${variants[variant]} transition-all hover:scale-[1.02] active:scale-[0.98]`}
    >
      <div className={`p-2 rounded-full ${variant === 'default' ? 'bg-slate-100' : 'bg-white/20'}`}>
        <Icon className="w-5 h-5" />
      </div>
      <span className="text-sm font-medium">{label}</span>
    </Button>
  );
}