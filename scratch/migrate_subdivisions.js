import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jxsqlvpydnjssukeyjrm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4c3FsdnB5ZG5qc3N1a2V5anJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MDkwNjEsImV4cCI6MjA5NTk4NTA2MX0.JKqgG8-hc_F_nsIjKDLq22S5-ynF9qyOEdzbE2aDEBQ';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  try {
    console.log('Fetching profiles...');
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*');

    if (error) throw error;

    console.log(`Found ${profiles.length} profiles:`);
    for (const p of profiles) {
      console.log(`- ${p.name} (${p.role}): sub_div_id = "${p.sub_div_id}"`);
    }

    console.log('\nStarting migration...');
    let updatedCount = 0;

    for (const p of profiles) {
      let newSubDiv = null;
      if (p.sub_div_id === 'Academic' || p.sub_div_id === 'Pub') {
        newSubDiv = 'Academic & Publication';
      } else if (p.sub_div_id === 'Project' || p.sub_div_id === 'Comp') {
        newSubDiv = 'Project & Competition';
      }

      if (newSubDiv) {
        console.log(`Updating ${p.name}: "${p.sub_div_id}" -> "${newSubDiv}"`);
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ sub_div_id: newSubDiv })
          .eq('id', p.id);

        if (updateError) {
          console.error(`Failed to update ${p.name}:`, updateError.message);
        } else {
          updatedCount++;
        }
      }
    }

    console.log(`Migration completed! Updated ${updatedCount} profiles.`);
  } catch (err) {
    console.error('Migration failed:', err);
  }
}

run();
