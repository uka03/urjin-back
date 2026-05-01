type LifecycleRule = {
  id: string;
  enabled: boolean;
  conditions: {
    prefix: string;
  };
  deleteObjectsTransition: {
    condition: {
      type: 'Age';
      maxAge: number;
    };
  };
};

const requiredEnv = [
  'R2_ACCOUNT_ID',
  'R2_BUCKET',
  'CLOUDFLARE_API_TOKEN',
] as const;

const missing = requiredEnv.filter((key) => !process.env[key]);

if (missing.length) {
  throw new Error(`Missing env vars: ${missing.join(', ')}`);
}

const accountId = process.env.R2_ACCOUNT_ID!;
const bucket = process.env.R2_BUCKET!;
const jurisdiction = process.env.R2_JURISDICTION;
const prefix = process.env.R2_LIFECYCLE_PREFIX ?? 'uploads/';

const rule: LifecycleRule = {
  id: 'delete-uploads-after-1-day',
  enabled: true,
  conditions: { prefix },
  deleteObjectsTransition: {
    condition: {
      type: 'Age',
      maxAge: 24 * 60 * 60,
    },
  },
};

const url = new URL(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/lifecycle`,
);

if (jurisdiction) {
  url.searchParams.set('jurisdiction', jurisdiction);
}

async function main() {
  const existingResponse = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
    },
  });

  const existingBody = await existingResponse.json().catch(() => undefined);

  if (!existingResponse.ok) {
    throw new Error(
      `Cloudflare lifecycle read failed (${existingResponse.status}): ${JSON.stringify(existingBody)}`,
    );
  }

  const existingRules = Array.isArray(existingBody?.result?.rules)
    ? existingBody.result.rules
    : Array.isArray(existingBody?.rules)
      ? existingBody.rules
      : [];

  const rules = [
    ...existingRules.filter((existingRule) => existingRule.id !== rule.id),
    rule,
  ];

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ rules }),
  });

  const body = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw new Error(
      `Cloudflare lifecycle update failed (${response.status}): ${JSON.stringify(body)}`,
    );
  }

  console.log(
    `R2 lifecycle enabled for ${bucket}/${prefix}: delete after 1 day`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
