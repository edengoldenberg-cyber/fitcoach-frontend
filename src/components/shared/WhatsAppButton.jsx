import React from 'react';
import { Button } from '@/components/ui/button';
import { MessageCircle } from 'lucide-react';

export default function WhatsAppButton({ 
  phoneNumber, 
  message, 
  label = 'שלח הודעה בוואטסאפ',
  variant = 'default',
  size = 'default',
  className = ''
}) {
  const openWhatsApp = () => {
    if (!phoneNumber) {
      alert('אין מספר טלפון');
      return;
    }
    
    // Clean phone number (remove spaces, dashes, etc.)
    const cleanPhone = phoneNumber.replace(/[^0-9+]/g, '');
    
    // Encode message for URL
    const encodedMessage = encodeURIComponent(message);
    
    // Open WhatsApp
    const url = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
    window.open(url, '_blank');
  };

  return (
    <Button
      onClick={openWhatsApp}
      variant={variant}
      size={size}
      className={`${className} ${variant === 'default' ? 'bg-green-500 hover:bg-green-600' : ''}`}
      disabled={!phoneNumber}
    >
      <MessageCircle className="w-4 h-4 ml-2" />
      {label}
    </Button>
  );
}