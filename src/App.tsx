
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


type UserStats = {
  user_id: string;
  popim_kuupaev: string | null;
  popimal_kuupaeval_minuteid: number | null;
  popim_nadalapaev: string | null;
  popimal_nadalapaeval_minuteid: number | null;
  mitu_paeva: number | null;
  popim_trenn: string | null;
  mitu_paeva_jouksis: number | null;
  updated_at: string;
  aeg_kokku: number | null;
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

  
  const [stats, setStats] = useState<UserStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);


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

  
  useEffect(() => {
    if (!session) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      channel = supabase
        .channel('stats-realtime')
        .on('postgres_changes', {
          event: '*',                 // INSERT/UPDATE/DELETE
          schema: 'public',
          table: 'trennistatistika_userid',
          filter: `user_id=eq.${user.id}`, // ainult oma rida
        }, (_payload) => {
          // console.log('stats change', _payload)
          loadStats();                // et UI uueneks
        })
        .subscribe();
    })();

    return () => { if (channel) supabase.removeChannel(channel); };
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

  
async function loadStats() {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setStats(null); return; }

      const { data, error } = await supabase
        .from('trennistatistika_userid')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) {
        // Kui kasutajal pole veel trenne, .single() võib errori visata
        setStats(null);
      } else {
        setStats(data as UserStats);
      }
    } catch (err: any) {
      setStatsError(err.message ?? 'Tundmatu viga');
    } finally {
      setStatsLoading(false);
    }
  }

  // lae esmalt stats
  useEffect(() => {
    if (!session) return;
    loadStats();
  }, [session]);


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
      setTyyp("");
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
  <>
    <header className="topbar">
      <h1>Tehtud trennid</h1>
      <button onClick={signOut}>Logi välja</button>
    </header>

    <main className="layout">
      <div className="left">
        <section className="card">
          <h2>Lisa trenn</h2>
          <div style={{display:'grid', gridTemplateColumns:'1fr 160px 120px 120px auto', gap:8, alignItems:'center', justifyContent:'center'}}>
            <select id="tüüp" name="tüüp" onChange={e=>setTyyp(e.target.value)}>
              <option value="">- vali tüüp -</option>
              <option value="Jooksmine">Jooksmine</option>
              <option value="Kõndimine">Kõndimine</option>
              <option value="Käepäev">Käepäev</option>
              <option value="Jalapäev">Jalapäev</option>
              <option value="Core">Core</option>
            </select>
            <input id="date" type="date" value={kuupaev} onChange={e=>setKuupaev(e.target.value)} />
            <input id="kestus" type="number" min={0} placeholder="kestus (min)" value={kestus} onChange={e=>setKestus(Number(e.target.value))} />
            <label style={{display:'flex', alignItems:'center', gap:6}}>
              <input type="checkbox" checked={kasJouksis} onChange={e=>setKasJouksis(e.target.checked)} />
              Jõuksis?
            </label>
            <button onClick={addRow} disabled={!tyyp}>Lisa</button>
          </div>
        </section>

        <section className="card">
          <h2>Minu treeningud {loading && '…'}</h2>
          {rows.length === 0 ? (
            <p>Hetkel kirjeid pole.</p>
          ) : (
            <table style={{width:'100%', borderCollapse:'collapse'}}>
              <thead>
                <tr>
                  <th style={{textAlign:'left'}}>Kuupäev</th>
                  <th style={{textAlign:'left'}}>Tüüp</th>
                  <th style={{textAlign:'right'}}>Kestus (min)</th>
                  <th style={{textAlign:'center'}}>Jõuksis</th>
                  <th></th>
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

      <aside className="right">
        <section className="card">
          <h2>Minu statistika</h2>
          {statsLoading && <p>Laen…</p>}
          {statsError && <p style={{color:'crimson'}}>Viga: {statsError}</p>}
          {!statsLoading && !stats && <p>Statistikat pole veel - sisesta oma esimene trenn!</p>}

          {stats && (
            <ul>
              <li><b>Kõige rohkem tegid trenni: </b> {stats.popim_kuupaev ?? '-'} ({stats.popimal_kuupaeval_minuteid ?? 0} minutit)</li>
              <li><b>Populaarseim nädalapäev:</b> {stats.popim_nadalapaev ?? '-'} ({stats.popimal_nadalapaeval_minuteid ?? 0} min)</li>
              <li><b>Populaarseim trennitüüp:</b> {stats.popim_trenn ?? '-'}</li>
              <li><b>Kokku oled teinud:</b> {stats.aeg_kokku ?? '-'} tundi</li>
              <li><b>Jõuksis käisid:</b> {stats.mitu_paeva_jouksis ?? 0} korda</li>
              <li><b>Kokku trennipäevi:</b> {stats.mitu_paeva ?? 0}</li>
              <li style={{color:'#666'}}>Uuendatud: {new Date(stats.updated_at).toLocaleString()}</li>
            </ul>
          )}
        </section>
      </aside>
    </main>
  </>
);
}
