declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

// Resolved by Supabase Edge Runtime (Deno) at function runtime.
// @ts-ignore
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

type VerificationAction = 'approved' | 'rejected' | 'resubmission_requested';

interface RequestBody {
  landlord_id: string;
  action: VerificationAction;
  remarks?: string;
}

async function sendWithResend(args: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: args.from,
      to: [args.to],
      subject: args.subject,
      text: args.text
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send email via Resend: ${errorText}`);
  }
}

async function sendWithSendGrid(args: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}) {
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: args.to }] }],
      from: { email: args.from },
      subject: args.subject,
      content: [{ type: 'text/plain', value: args.text }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send email via SendGrid: ${errorText}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as RequestBody;
    if (!body.landlord_id || !body.action) {
      return new Response(JSON.stringify({ error: 'Missing landlord_id or action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const sendGridApiKey = Deno.env.get('SENDGRID_API_KEY');
    const provider = (Deno.env.get('EMAIL_PROVIDER') || '').toLowerCase().trim();
    const fromEmail =
      Deno.env.get('LANDLORD_VERIFICATION_FROM_EMAIL') ||
      Deno.env.get('RESEND_FROM_EMAIL') ||
      Deno.env.get('SENDGRID_FROM_EMAIL') ||
      'onboarding@resend.dev';

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase environment variables are missing.');
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    const { data: landlord, error: landlordError } = await supabase
      .from('landlords')
      .select('full_name, email, status')
      .eq('id', body.landlord_id)
      .single();

    if (landlordError || !landlord) {
      throw landlordError || new Error('Landlord not found.');
    }

    const subjectMap: Record<VerificationAction, string> = {
      approved: 'Your Rentify landlord account has been approved',
      rejected: 'Your Rentify landlord account has been rejected',
      resubmission_requested: 'Rentify landlord verification needs resubmission'
    };

    const messageMap: Record<VerificationAction, string> = {
      approved: `Hello ${landlord.full_name || 'Landlord'}, your landlord verification has been approved. You can now access your landlord dashboard.`,
      rejected: `Hello ${landlord.full_name || 'Landlord'}, your landlord verification has been rejected. ${body.remarks ? `Reason: ${body.remarks}` : ''}`,
      resubmission_requested: `Hello ${landlord.full_name || 'Landlord'}, the admin requested document resubmission. ${body.remarks ? `Remarks: ${body.remarks}` : ''}`
    };

    const emailText = `${messageMap[body.action]}\n\nCurrent status: ${landlord.status}`;

    if (provider === 'sendgrid') {
      if (!sendGridApiKey) {
        throw new Error('EMAIL_PROVIDER is set to sendgrid but SENDGRID_API_KEY is missing.');
      }

      await sendWithSendGrid({
        apiKey: sendGridApiKey,
        from: fromEmail,
        to: landlord.email,
        subject: subjectMap[body.action],
        text: emailText
      });
    } else {
      if (!resendApiKey) {
        throw new Error('RESEND_API_KEY is not configured for landlord-verification-notify function.');
      }

      await sendWithResend({
        apiKey: resendApiKey,
        from: fromEmail,
        to: landlord.email,
        subject: subjectMap[body.action],
        text: emailText
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
