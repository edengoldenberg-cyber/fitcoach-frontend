import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Watch, Plus } from "lucide-react";
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function DeviceSyncButton({ traineeEmail }) {
  const navigate = useNavigate();

  const { data: connectedDevices = [] } = useQuery({
    queryKey: ['connectedDevices', traineeEmail],
    queryFn: () => base44.entities.ConnectedDevice.filter({ trainee_email: traineeEmail }),
    enabled: !!traineeEmail,
  });

  const hasDevices = connectedDevices.length > 0;

  return (
    <Button
      onClick={() => navigate(createPageUrl('DeviceConnect'))}
      variant="outline"
      size="sm"
      className={`${hasDevices ? 'border-green-500 text-green-700' : 'border-blue-500 text-blue-700'}`}
    >
      <Watch className="w-4 h-4 ml-1" />
      {hasDevices ? `${connectedDevices.length} מכשירים` : 'חבר מכשיר'}
      {!hasDevices && <Plus className="w-3 h-3 mr-1" />}
    </Button>
  );
}