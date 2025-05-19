import Link from 'next/link';

export default function Home() {
  return (
    <div className='container mx-auto p-4'>
      <h1 className='text-2xl font-bold mb-4'>Welcome to Wallet Tracker</h1>
      <Link href='/upload' className='text-blue-500 underline'>
        Go to Upload Page
      </Link>
    </div>
  );
}
