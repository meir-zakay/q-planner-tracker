import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

export default function RoleGate({ allowed, children }) {
  const { userRole } = useOutletContext();
  
  if (!allowed.includes(userRole)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ShieldAlert className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold text-foreground">Access Denied</h2>
        <p className="text-sm text-muted-foreground mt-1">You don't have permission to view this page.</p>
      </div>
    );
  }
  
  return children;
}