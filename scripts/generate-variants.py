#!/usr/bin/env python3
"""
Run this to regenerate all landing page variants from the master template.
Triggered automatically by GitHub Actions on every push to the template.
"""
import json, os, re

config = json.load(open('scripts/variants-config.json'))
template_path = config['template']
base_url = config['base_url']
template_coupon = config['template_coupon']

template = open(template_path).read()

# Fix relative image paths to absolute
for img in ['jay-photo.jpg', 'donna-avatar.jpg']:
    template = template.replace(f'src="{img}"', f'src="{base_url}{img}"')
template = template.replace('content="og-image.png"', f'content="{base_url}og-image.png"')
template = template.replace('href="og-image.png"', f'href="{base_url}og-image.png"')

for variant in config['variants']:
    slug = variant['slug']
    coupon = variant['coupon']
    label = variant['label']
    
    content = template.replace(
        f'prefilled_promo_code={template_coupon}',
        f'prefilled_promo_code={coupon}'
    )
    
    os.makedirs(slug, exist_ok=True)
    with open(f'{slug}/index.html', 'w') as f:
        f.write(content)
    print(f'  [{label}] -> /{slug}/  (coupon: {coupon})')

print(f'\nDone. {len(config["variants"])} variants generated.')
