import { useState, useEffect } from 'react';

export function useQuarterSelection() {
  const currentYear = new Date().getFullYear();
  const currentQ = `Q${Math.ceil((new Date().getMonth() + 1) / 3)}`;
  
  const [selectedYear, setSelectedYear] = useState(() => {
    const saved = localStorage.getItem('selectedYear');
    return saved ? parseInt(saved) : currentYear;
  });
  const [selectedQuarter, setSelectedQuarter] = useState(() => localStorage.getItem('selectedQuarter') || currentQ);

  useEffect(() => {
    const handler = () => {
      const y = localStorage.getItem('selectedYear');
      const q = localStorage.getItem('selectedQuarter');
      if (y) setSelectedYear(parseInt(y));
      if (q) setSelectedQuarter(q);
    };
    window.addEventListener('quarterChanged', handler);
    return () => window.removeEventListener('quarterChanged', handler);
  }, []);

  return { selectedYear, selectedQuarter };
}