'use client';

import dynamicImport from 'next/dynamic';

export const dynamic = 'force-dynamic';

const MedicalRecordsNoSSR = dynamicImport(() => import('./MedicalRecordsView'), {
  ssr: false,
});

export default function Page() {
  return <MedicalRecordsNoSSR />;
}
