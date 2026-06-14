import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function BackButton({ fallbackPath, label = 'חזור' }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    // Check if there's navigation history
    if (window.history.length > 1 && location.key !== 'default') {
      navigate(-1);
    } else {
      // Fallback to provided path or home
      navigate(fallbackPath || createPageUrl('Home'));
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleBack}
      className="flex items-center gap-2"
    >
      <ArrowRight className="w-4 h-4" />
      {label}
    </Button>
  );
}