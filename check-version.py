import os, requests, json, hashlib

TOKEN = 'YOUR_GITHUB_TOKEN'
HEADERS = {'Authorization': f'token {TOKEN}', 'Accept': 'application/vnd.github.v3+json'}
REPO = 'mei-junhao/winnicott-chat'
PUBLIC = r'C:\Users\Administrator\WorkBuddy\2026-06-21-10-33-32\winnicott-chat\public'

# Get gh-pages tree
r = requests.get(f'https://api.github.com/repos/{REPO}/git/refs/heads/gh-pages', headers=HEADERS)
if r.status_code != 200:
    print(f'FAIL: Cannot get gh-pages ref ({r.status_code})')
    exit(1)
commit_sha = r.json()['object']['sha']

r = requests.get(f'https://api.github.com/repos/{REPO}/git/commits/{commit_sha}', headers=HEADERS)
tree_sha = r.json()['tree']['sha']

# Get all files recursively
r = requests.get(f'https://api.github.com/repos/{REPO}/git/trees/{tree_sha}?recursive=1', headers=HEADERS)
if r.status_code != 200:
    print(f'FAIL: Cannot get tree ({r.status_code})')
    exit(1)

remote_files = {}
for item in r.json()['tree']:
    if item['type'] == 'blob':
        remote_files[item['path']] = item['sha']

# Compare with local public/
local_files = {}
skip_prefixes = ['backup', 'node_modules', 'index-dev', 'v4-', 'original-index', 'redirect']
for root, dirs, files in os.walk(PUBLIC):
    for f in files:
        fpath = os.path.join(root, f)
        relpath = os.path.relpath(fpath, PUBLIC).replace('\\', '/')
        if any(relpath.startswith(p) for p in skip_prefixes):
            continue
        size = os.path.getsize(fpath)
        local_files[relpath] = size

print(f'Local files: {len(local_files)}')
print(f'Remote files (gh-pages): {len(remote_files)}')
print()

# Check for differences
all_paths = set(local_files.keys()) | set(remote_files.keys())
diff_count = 0
for path in sorted(all_paths):
    if path not in remote_files:
        print(f'LOCAL_ONLY: {path}')
        diff_count += 1
    elif path not in local_files:
        print(f'REMOTE_ONLY: {path}')
        diff_count += 1
    else:
        # Check SHA by getting blob
        r = requests.get(f'https://api.github.com/repos/{REPO}/git/blobs/{remote_files[path]}', headers=HEADERS)
        if r.status_code == 200:
            remote_size = r.json()['size']
            local_size = local_files[path]
            if local_size != remote_size:
                print(f'SIZE_DIFF: {path} (local:{local_size}B remote:{remote_size}B)')
                diff_count += 1

if diff_count == 0:
    print('✅ Local matches gh-pages EXACTLY')
else:
    print(f'\n⚠️ {diff_count} difference(s) found')

# Also check main branch
print('\n--- main branch (full repo) ---')
r = requests.get(f'https://api.github.com/repos/{REPO}/git/refs/heads/main', headers=HEADERS)
if r.status_code == 200:
    main_sha = r.json()['object']['sha']
    r = requests.get(f'https://api.github.com/repos/{REPO}/git/commits/{main_sha}', headers=HEADERS)
    print(f'Remote main: {main_sha[:8]} - {r.json()["message"]}')
    print(f'Local main head: 2ed361b')
    print(f'⚠️ Local has 2 extra commits that were not pushed to main')
else:
    print('Cannot fetch remote main branch')
