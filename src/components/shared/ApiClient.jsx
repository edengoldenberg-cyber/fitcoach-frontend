// Retry logic with exponential backoff for rate limits
export async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      const errorCode = error.response?.data?.error_code;
      
      // Only retry on rate limit errors
      if (errorCode === 'RATE_LIMIT_EXCEEDED' && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
        console.log(`Rate limit hit, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Re-throw error for other cases or final retry
      throw error;
    }
  }
}

// Format error for user display
export function formatApiError(error) {
  const data = error.response?.data || {};
  const errorCode = data.error_code || 'UNKNOWN_ERROR';
  const messageHe = data.message_he || 'שגיאה לא צפויה';
  const debugId = data.debug_id;
  
  let displayMessage = messageHe;
  
  if (debugId) {
    displayMessage += `\n\n🔍 מזהה תקלה: ${debugId}`;
    displayMessage += '\n(העתק מזהה זה לשליחה למאמן)';
  }
  
  return {
    message: displayMessage,
    errorCode,
    debugId,
    details: data.details
  };
}