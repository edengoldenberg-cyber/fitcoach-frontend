/**
 * Barcode Scanner Diagnostics Analyzer
 * Analyzes barcode logs and identifies issues
 */

export function analyzeBarcodeIssue(logs) {
  const result = {
    status: 'UNKNOWN',
    issue: null,
    recommendations: [],
    timeline: [],
    debugInfo: {}
  };

  if (!logs || logs.length === 0) {
    result.status = 'NO_LOGS';
    result.issue = 'אין לוגים זמינים';
    result.recommendations = ['נסה לבצע סריקת ברקוד ולחזור לדיבאג'];
    return result;
  }

  // Build timeline
  result.timeline = logs.map(log => ({
    time: new Date(log.ts).toLocaleTimeString('he-IL'),
    action: log.message || log.action,
    level: log.level,
    data: log.data
  }));

  // Check for errors
  const errors = logs.filter(l => l.level === 'error');
  const warnings = logs.filter(l => l.level === 'warn');
  const successes = logs.filter(l => l.level === 'success');

  result.debugInfo = {
    totalLogs: logs.length,
    errors: errors.length,
    warnings: warnings.length,
    successes: successes.length
  };

  // Analyze patterns
  
  // 1. Camera permission denied
  const permissionError = errors.find(e => 
    e.message?.includes('permission') || 
    e.data?.errorName === 'NotAllowedError'
  );
  if (permissionError) {
    result.status = 'PERMISSION_DENIED';
    result.issue = 'גישה למצלמה נדחתה';
    result.recommendations = [
      'פתח הגדרות הדפדפן',
      `מצא את האתר ${typeof window !== 'undefined' ? window.location.hostname : 'FIT COACH PRO'}`,
      'אפשר גישה למצלמה',
      'רענן את הדף'
    ];
    return result;
  }

  // 2. Image decode timeout
  const imageTimeout = errors.find(e => 
    e.message?.includes('image decode failed') && 
    e.data?.isTimeout === true
  );
  if (imageTimeout) {
    result.status = 'IMAGE_TIMEOUT';
    result.issue = 'זיהוי ברקוד מהתמונה נכשל (Timeout)';
    result.recommendations = [
      'ודא שהברקוד ברור בתמונה',
      'נסה לצלם תמונה עם תאורה טובה יותר',
      'ודא שהברקוד לא מטושטש או חסום',
      'נסה סריקה חיה במקום תמונה'
    ];
    return result;
  }

  // 3. Image decode failed (general)
  const imageDecodeFailed = errors.find(e => 
    e.message?.includes('image decode failed')
  );
  if (imageDecodeFailed) {
    result.status = 'IMAGE_DECODE_FAILED';
    result.issue = 'לא זוהה ברקוד בתמונה';
    result.recommendations = [
      'ודא שהתמונה מכילה ברקוד ברור',
      'נסה לצלם שוב עם מיקוד טוב יותר',
      'ודא שהברקוד לא חלקי או קרוע',
      'נסה סריקה חיה במקום תמונה'
    ];
    return result;
  }

  // 4. Product not found after successful scan
  const scanSuccess = successes.find(s => s.message?.includes('barcode detected'));
  const notFound = warnings.find(w => w.message?.includes('product not found'));
  if (scanSuccess && notFound) {
    const barcode = notFound.data?.barcode;
    result.status = 'PRODUCT_NOT_FOUND';
    result.issue = `ברקוד זוהה בהצלחה (${barcode}) אך המוצר לא קיים במאגר`;
    result.recommendations = [
      'המוצר לא קיים במאגר המזון',
      'ניתן להזין את המוצר ידנית דרך "הוסף ארוחה"',
      'פנה למאמן להוספת המוצר למאגר'
    ];
    return result;
  }

  // 5. Camera started but no detection
  const cameraActive = logs.find(l => l.message?.includes('camera stream active'));
  const scanStarted = logs.find(l => l.message?.includes('scan started'));
  if ((cameraActive || scanStarted) && successes.length === 0 && errors.length === 0) {
    result.status = 'NO_DETECTION';
    result.issue = 'המצלמה פעילה אך לא זוהה ברקוד';
    result.recommendations = [
      'ודא שהברקוד נמצא במרכז המסגרת הירוקה',
      'התקרב/י למוצר יותר',
      'ודא תאורה טובה',
      'ודא שהברקוד לא מטושטש (ייצוב ידיים)',
      'נסה להזיז את המוצר לזוויות שונות'
    ];
    return result;
  }

  // 6. Successful flow
  const foundInDb = successes.find(s => s.message?.includes('product found in database'));
  if (foundInDb) {
    result.status = 'SUCCESS';
    result.issue = null;
    result.recommendations = ['הסריקה הצליחה! המוצר נמצא במאגר'];
    return result;
  }

  // 7. No clear pattern
  result.status = 'UNCLEAR';
  result.issue = 'לא זוהתה בעיה ברורה';
  result.recommendations = [
    'בדוק את הטיימליין למטה לפרטים',
    'אם הבעיה נמשכת, העתק את הדוח ושלח למאמן'
  ];
  
  return result;
}