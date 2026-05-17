import re

with open('src/config/feeds.ts', 'r') as f:
    content = f.read()

# 1. Remove INTEL_SOURCES array
content = re.sub(r'export const INTEL_SOURCES: Feed\[\] = \[\n(?:.|\n)*?\];\n+', '', content)

# 2. Remove DEFAULT_ENABLED_INTEL array
content = re.sub(r'export const DEFAULT_ENABLED_INTEL: string\[\] = \[\n(?:.|\n)*?\];\n+', '', content)

# 3. Remove gov, crisis, energy, thinktanks from FULL_FEEDS
# This needs careful matching.
def remove_block(category, text):
    pattern = r'  ' + category + r': \[\n(?:.|\n)*?  \],\n'
    return re.sub(pattern, '', text)

content = remove_block('crisis', content)
content = remove_block('energy', content)
content = remove_block('gov', content)

# 4. Remove gov, crisis, energy from DEFAULT_ENABLED_SOURCES
for key in ['gov', 'crisis', 'energy']:
    content = re.sub(r'  ' + key + r': \[.*?\],\n', '', content)

# 5. Fix computeDefaultDisabledSources
content = content.replace('for (const f of INTEL_SOURCES) all.add(f.name);\n  ', '')

# 6. Fix getTotalFeedCount
content = content.replace('for (const f of INTEL_SOURCES) all.add(f.name);\n  ', '')

# 7. Fix DEV block INTEL_SOURCES
content = content.replace('for (const f of INTEL_SOURCES) allFeedNames.add(f.name);\n    ', '')

# 8. Fix getAllDefaultEnabledSources
content = content.replace('  if (SITE_VARIANT === \'full\') {\n    DEFAULT_ENABLED_INTEL.forEach(n => s.add(n));\n  }\n', '')

# 9. Fix getLocaleBoostedSources
content = content.replace(', ...INTEL_SOURCES', '')

# 10. Update SOURCE_REGION_MAP (remove 'military', 'energy', 'gov' if they exist)
# Actually, let's just write the changes
with open('src/config/feeds.ts', 'w') as f:
    f.write(content)
