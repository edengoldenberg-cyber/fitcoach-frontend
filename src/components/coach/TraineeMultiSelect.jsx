import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Search, Users, X } from 'lucide-react';

export default function TraineeMultiSelect({ trainees, selectedTrainees, onSelectionChange }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const filteredTrainees = trainees.filter(t =>
    t.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.phone?.includes(searchQuery) ||
    t.user_email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleTrainee = (traineeEmail) => {
    if (selectedTrainees.includes(traineeEmail)) {
      onSelectionChange(selectedTrainees.filter(e => e !== traineeEmail));
    } else {
      onSelectionChange([...selectedTrainees, traineeEmail]);
    }
  };

  const selectAll = () => {
    onSelectionChange(filteredTrainees.map(t => t.user_email));
  };

  const clearAll = () => {
    onSelectionChange([]);
  };

  return (
    <div>
      <label className="block text-sm font-bold mb-2 flex items-center gap-2">
        <span className="text-red-500">*</span>
        בחר מתאמנים
        {selectedTrainees.length > 0 && (
          <Badge className="bg-teal-600">נבחרו {selectedTrainees.length} מתאמנים</Badge>
        )}
      </label>

      {/* Selected Trainees Display */}
      {selectedTrainees.length > 0 && (
        <div className="mb-3 p-3 bg-teal-50 rounded-lg border-2 border-teal-300">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-teal-800">
              ✓ {selectedTrainees.length} מתאמנים נבחרו
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="h-7 text-red-600 hover:text-red-700"
            >
              <X className="w-3 h-3 ml-1" />
              נקה הכל
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedTrainees.map(email => {
              const trainee = trainees.find(t => t.user_email === email);
              return (
                <Badge key={email} variant="outline" className="bg-white">
                  {trainee?.full_name}
                  <button
                    onClick={() => toggleTrainee(email)}
                    className="mr-1 hover:text-red-600"
                  >
                    ×
                  </button>
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {/* Search Input */}
      <div className="relative mb-2">
        <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="🔍 חפש לפי שם, טלפון או מייל..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          className="pr-10 h-11"
        />
      </div>

      {/* Dropdown with Checkboxes */}
      {showDropdown && searchQuery && (
        <Card className="max-h-64 overflow-y-auto border-2 mb-2">
          <div className="sticky top-0 bg-white border-b p-2 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={selectAll}
              className="flex-1 h-8 text-xs"
            >
              <Users className="w-3 h-3 ml-1" />
              בחר הכל ({filteredTrainees.length})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={clearAll}
              className="flex-1 h-8 text-xs"
            >
              נקה הכל
            </Button>
          </div>
          
          {filteredTrainees.length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-sm">
              לא נמצאו מתאמנים
            </div>
          ) : (
            filteredTrainees.map(t => (
              <div
                key={t.id}
                className="p-3 border-b last:border-b-0 hover:bg-slate-50 cursor-pointer flex items-center gap-3"
                onClick={() => toggleTrainee(t.user_email)}
              >
                <Checkbox
                  checked={selectedTrainees.includes(t.user_email)}
                  onCheckedChange={() => toggleTrainee(t.user_email)}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{t.full_name}</p>
                    {t.isExternal && (
                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                        {t.source === 'ARBOX' ? '📦 Arbox' : '👤 ידני'}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{t.phone || t.user_email}</p>
                </div>
              </div>
            ))
          )}
        </Card>
      )}

      {showDropdown && searchQuery && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setShowDropdown(false);
            setSearchQuery('');
          }}
          className="w-full h-8 text-xs"
        >
          סגור
        </Button>
      )}
    </div>
  );
}