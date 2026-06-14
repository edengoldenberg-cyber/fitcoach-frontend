// Safe rendering wrapper to prevent crashes
import React from 'react';

export function SafeRender({ children, fallback = null, debugName = 'SafeRender' }) {
  try {
    return <>{children}</>;
  } catch (error) {
    console.error(`[${debugName}] Render error:`, error);
    return fallback || (
      <div className="p-4 bg-red-50 border border-red-200 rounded" dir="rtl">
        <p className="text-sm text-red-700">שגיאה בטעינת רכיב</p>
      </div>
    );
  }
}

// Safe array mapping
export function safeMap(array, mapFn, fallback = []) {
  try {
    if (!Array.isArray(array)) {
      console.warn('[safeMap] Not an array:', typeof array);
      return fallback;
    }
    return array.map((item, index) => {
      try {
        return mapFn(item, index);
      } catch (err) {
        console.error(`[safeMap] Error at index ${index}:`, err);
        return null;
      }
    }).filter(Boolean);
  } catch (err) {
    console.error('[safeMap] Critical error:', err);
    return fallback;
  }
}

// Safe property access
export function safeGet(obj, path, fallback = null) {
  try {
    if (!obj || typeof obj !== 'object') return fallback;
    
    const keys = path.split('.');
    let result = obj;
    
    for (const key of keys) {
      if (result === null || result === undefined) return fallback;
      result = result[key];
    }
    
    return result !== undefined ? result : fallback;
  } catch (err) {
    console.error('[safeGet] Error accessing path:', path, err);
    return fallback;
  }
}

// Safe reduce
export function safeReduce(array, reduceFn, initialValue) {
  try {
    if (!Array.isArray(array)) {
      console.warn('[safeReduce] Not an array:', typeof array);
      return initialValue;
    }
    return array.reduce((acc, item, index) => {
      try {
        return reduceFn(acc, item, index);
      } catch (err) {
        console.error(`[safeReduce] Error at index ${index}:`, err);
        return acc;
      }
    }, initialValue);
  } catch (err) {
    console.error('[safeReduce] Critical error:', err);
    return initialValue;
  }
}

// Safe filter
export function safeFilter(array, filterFn, fallback = []) {
  try {
    if (!Array.isArray(array)) {
      console.warn('[safeFilter] Not an array:', typeof array);
      return fallback;
    }
    return array.filter((item, index) => {
      try {
        return filterFn(item, index);
      } catch (err) {
        console.error(`[safeFilter] Error at index ${index}:`, err);
        return false;
      }
    });
  } catch (err) {
    console.error('[safeFilter] Critical error:', err);
    return fallback;
  }
}