'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function DbTest() {
  const { projectCode } = useParams();
  const [msg, setMsg] = useState('loading...');

  useEffect(() => {
    (async () => {
      // subjects を1件だけ読んでみる（RLSで認証必要ならエラーになるが“API key エラー”とは区別できる）
      const { data, error } = await supabase.from('subjects').select('id, name').limit(1);
      if (error) setMsg('DB error: ' + error.message);
      else setMsg('OK: ' + JSON.stringify(data));
    })();
  }, []);

  return <main className="p-6"><h1>DB test ({projectCode})</h1><pre>{msg}</pre></main>;
}
