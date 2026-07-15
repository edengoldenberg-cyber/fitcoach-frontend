import { useEffect } from 'react';

// CoachAutomations relied on the AutomationRule entity which no longer exists in the backend.
// WhatsApp Automation management is fully available at /WhatsAppAutomations.
export default function CoachAutomations() {
  useEffect(() => {
    window.location.replace('/WhatsAppAutomations');
  }, []);
  return null;
}
