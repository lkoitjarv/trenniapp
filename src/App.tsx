
import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';

type Trenn = {
  id: number;
  user_id: string;
  created_at: string;
  tyyp: string;
  kuupaev: string;        //YYYY-MM-DD
  kestus: number;         //minutid
  kas_jouksis: boolean;
};

export default function App() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']>(null);
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');

  //vormi väljad
  const [tyyp, setTyyp] = useState('');
  const today = useMemo(() => new Date().toISOString().slice(0,10), []);
  const [kuupaev, setKuupaev] = useState(today);
  const [kestus, setKestus] = useState<number>(30);
  const [kasJouksis, setKasJouksis] = useState(false);

  const [rows, setRows] = useState<Trenn[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    loadData();
    const channel = supabase
      .channel('trenni-realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'trenni_info' },
        () => loadData()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session]);

  async function signUp() {
    const { error } = await supabase.auth.signUp({ email, password: pass });
    if (error) alert(error.message);
    else alert('Kui e-posti kinnitus on nõutud, vaata postkasti.');
  }

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) alert(error.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function loadData() {
    setLoading(true);
    const { data, error } = await supabase
      .from('trenni_info')
      .select('*')
      .order('kuupaev', { ascending: false })
      .order('id', { ascending: false });
    if (error) alert(error.message);
    else setRows(data as Trenn[]);
    setLoading(false);
  }

  async function addRow() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from('trenni_info')
      .insert({
        user_id: user.id,
        tyyp,
        kuupaev,                    // YYYY-MM-DD
        kestus: Number(kestus),
        kas_jouksis: Boolean(kasJouksis)
      });
    if (error) alert(error.message);
    else {
      setTyyp('');
      setKuupaev(today);
      setKestus(30);
      setKasJouksis(false);
    }
  }

  async function delRow(id: number) {
    const { error } = await supabase.from('trenni_info').delete().eq('id', id);
    if (error) alert(error.message);
  }

  if (!session) {
    return (
      <div style={{ maxWidth: 420, margin: '4rem auto', fontFamily: 'system-ui, Arial' }}>
        <h1>Logi sisse</h1>
        <input placeholder="email" value={email} onChange={e=>setEmail(e.target.value)} style={{display:'block',width:'100%',marginBottom:8}} />
        <input placeholder="parool" type="password" value={pass} onChange={e=>setPass(e.target.value)} style={{display:'block',width:'100%',marginBottom:8}}/>
        <div style={{display:'flex', gap:8}}>
          <button onClick={signIn}>Logi sisse</button>
          <button onClick={signUp}>Loo konto</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '2rem auto', fontFamily: 'system-ui, Arial' }}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h1>Tehtud trennid</h1>
        <button onClick={signOut}>Logi välja</button>
      </div>

      <section style={{ padding:'1rem', border:'1px solid #ddd', borderRadius:8, marginBottom:'1rem' }}>
        <h2>Lisa trenn</h2>
        <div style={{display:'grid', gridTemplateColumns:'1fr 160px 120px 140px auto', gap:8, alignItems:'center'}}>
          <select name="tüüp" onChange={e=>setTyyp(e.target.value)}>
            <option value="Jooksmine">Jooksmine</option>
            <option value="Kõndimine">Kõndimine</option>
            <option value="Käepäev">Käepäev</option>
            <option value="Jalapäev">Jalapäev</option>
            <option value="Core">Core</option>
          </select>
          <input type="date" value={kuupaev} onChange={e=>setKuupaev(e.target.value)} />
          <input type="number" min={0} placeholder="kestus (min)" value={kestus} onChange={e=>setKestus(Number(e.target.value))} />
          <label style={{display:'flex', alignItems:'center', gap:6}}>
            <input type="checkbox" checked={kasJouksis} onChange={e=>setKasJouksis(e.target.checked)} />
            Jõuksis?
          </label>
          <button onClick={addRow} disabled={!tyyp}>Lisa</button>
        </div>
      </section>

      <section>
        <h2>Minu treeningud {loading && '…'}</h2>
        {rows.length === 0 ? <p>Hetkel kirjeid pole.</p> : (
          <table style={{width:'100%', borderCollapse:'collapse'}}>
            <thead>
              <tr>
                <th style={{textAlign:'left', borderBottom:'1px solid #ccc'}}>Kuupäev</th>
                <th style={{textAlign:'left', borderBottom:'1px solid #ccc'}}>Tüüp</th>
                <th style={{textAlign:'right', borderBottom:'1px solid #ccc'}}>Kestus (min)</th>
                <th style={{textAlign:'center', borderBottom:'1px solid #ccc'}}>Jõuksis</th>
                <th style={{borderBottom:'1px solid #ccc'}}></th>
              </tr>
            </thead>
            <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td style={{padding:'6px 0'}}>{r.kuupaev}</td>
                <td>{r.tyyp}</td>
                <td style={{textAlign:'right'}}>{r.kestus}</td>
                <td style={{textAlign:'center'}}>{r.kas_jouksis ? '✔' : ''}</td>
                <td style={{textAlign:'right'}}>
                  <button onClick={() => delRow(r.id)}>Kustuta</button>
                </td>
              </tr>
            ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
