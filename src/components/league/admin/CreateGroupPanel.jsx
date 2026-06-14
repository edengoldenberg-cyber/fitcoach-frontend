import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function CreateGroupPanel({ onCreate }) {
  const [name, setName] = React.useState('');
  const [slogan, setSlogan] = React.useState('');

  const submit = () => {
    if (!name.trim()) return;
    onCreate({ name, slogan });
    setName('');
    setSlogan('');
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
      <h3 className="font-bold text-slate-900">יצירת קבוצה</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם קבוצה" />
        <Input value={slogan} onChange={(e) => setSlogan(e.target.value)} placeholder="סלוגן" />
        <Button disabled={!name.trim()} onClick={submit}>צור קבוצה</Button>
      </div>
    </div>
  );
}