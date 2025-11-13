export default function Diag() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '(missing)';
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '(missing)';
    return (
      <pre style={{padding:16}}>
  {`URL: ${url.slice(0, 40)}...
  ANON: ${anon.slice(0, 10)}... (length: ${anon.length})`}
      </pre>
    );
  }