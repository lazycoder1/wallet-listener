'use client';

import React from 'react';
import ProtectedAdminLayout from '@/components/ProtectedAdminLayout';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProtectedAdminLayout>{children}</ProtectedAdminLayout>;
}
