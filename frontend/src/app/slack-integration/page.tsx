'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function SlackIntegrationStatusPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);

  useEffect(() => {
    // The backend might send 'install_status' from the success redirect in slackRoutes.ts
    // or 'status' from a more generic redirect if you implement that elsewhere.
    const currentStatus =
      searchParams.get('install_status') || searchParams.get('status');
    setStatus(currentStatus);
    setTeamId(searchParams.get('team_id'));
    setError(searchParams.get('error'));
    setDescription(searchParams.get('description'));
  }, [searchParams]);

  // Basic styling - you can replace with Tailwind classes or your UI library components
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '80vh',
    padding: '20px',
    fontFamily: 'Arial, sans-serif',
    textAlign: 'center',
  };
  const successStyle: React.CSSProperties = { color: '#28a745' };
  const errorStyle: React.CSSProperties = { color: '#dc3545' };
  const linkStyle: React.CSSProperties = {
    marginTop: '20px',
    color: '#0070f3',
    textDecoration: 'none',
    fontSize: '1.1em',
  };

  if (status === 'success') {
    return (
      <div style={containerStyle}>
        <h1 style={successStyle}>Slack Integration Successful!</h1>
        <p>
          Your Slack workspace (Team ID: {teamId || 'N/A'}) has been
          successfully connected.
        </p>
        <p>You can now close this page or return to the application.</p>
        <Link href='/admin/companies' style={linkStyle}>
          Return to Companies Page
        </Link>
      </div>
    );
  }

  if (status === 'failure' || error) {
    return (
      <div style={containerStyle}>
        <h1 style={errorStyle}>Slack Integration Failed</h1>
        <p>Something went wrong while trying to connect your Slack account.</p>
        {error && (
          <p>
            <strong>Error Code:</strong> {error}
          </p>
        )}
        {description && (
          <p>
            <strong>Details:</strong> {description}
          </p>
        )}
        <Link href='/admin/companies' style={linkStyle}>
          Return to Companies Page
        </Link>
      </div>
    );
  }

  // Fallback / loading state if status is not yet determined or is unexpected
  return (
    <div style={containerStyle}>
      <h1>Processing Slack Integration...</h1>
      <p>
        Please wait a moment. If this page doesn't update, please try installing
        again or contact support.
      </p>
      <Link href='/admin/companies' style={linkStyle}>
        Go to Companies Page
      </Link>
    </div>
  );
}
