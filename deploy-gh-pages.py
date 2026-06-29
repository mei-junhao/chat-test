import os, json, base64, requests

GITHUB_TOKEN = 'YOUR_GITHUB_TOKEN'
REPO = 'mei-junhao/winnicott-chat'
PUBLIC_DIR = r'C:\Users\Administrator\WorkBuddy\2026-06-21-10-33-32\winnicott-chat\public'
HEADERS = {'Authorization': f'token {GITHUB_TOKEN}', 'Accept': 'application/vnd.github.v3+json'}

# Create blobs for public/ files
files_to_upload = []
skip_prefixes = ['backup', 'node_modules', 'index-dev', 'v4-', 'original-index']
for root, dirs, files in os.walk(PUBLIC_DIR):
    for f in files:
        fpath = os.path.join(root, f)
        relpath = os.path.relpath(fpath, PUBLIC_DIR).replace('\\', '/')
        if any(relpath.startswith(p) for p in skip_prefixes):
            continue
        with open(fpath, 'rb') as fh:
            content = fh.read()
        r = requests.post(f'https://api.github.com/repos/{REPO}/git/blobs', 
                         headers=HEADERS, json={
            'content': base64.b64encode(content).decode(),
            'encoding': 'base64'
        })
        if r.status_code == 201:
            files_to_upload.append({
                'path': relpath,
                'mode': '100644',
                'type': 'blob',
                'sha': r.json()['sha']
            })
            print(f'OK {relpath} ({len(content)}B)')
        else:
            print(f'FAIL {relpath}: {r.status_code}')

print(f'\nTotal: {len(files_to_upload)} files')

# Create tree
r = requests.post(f'https://api.github.com/repos/{REPO}/git/trees', 
                 headers=HEADERS, json={'base_tree': None, 'tree': files_to_upload})
if r.status_code != 201:
    print(f'Tree FAIL: {r.status_code} {r.text[:200]}')
    exit(1)
tree_sha = r.json()['sha']
print(f'Tree: {tree_sha}')

# Create commit (orphan - no parent for gh-pages)
r = requests.post(f'https://api.github.com/repos/{REPO}/git/commits', headers=HEADERS, json={
    'message': 'Deploy to GitHub Pages',
    'tree': tree_sha,
    'parents': []
})
if r.status_code != 201:
    print(f'Commit FAIL: {r.status_code} {r.text[:200]}')
    exit(1)
commit_sha = r.json()['sha']
print(f'Commit: {commit_sha}')

# Update gh-pages ref
r = requests.patch(f'https://api.github.com/repos/{REPO}/git/refs/heads/gh-pages', 
                   headers=HEADERS, json={'sha': commit_sha, 'force': True})
if r.status_code == 200:
    print(f'DONE: https://mei-junhao.github.io/winnicott-chat/')
else:
    # Try create
    r = requests.post(f'https://api.github.com/repos/{REPO}/git/refs', 
                     headers=HEADERS, json={'ref': 'refs/heads/gh-pages', 'sha': commit_sha})
    if r.status_code == 201:
        print(f'DONE (new branch): https://mei-junhao.github.io/winnicott-chat/')
    else:
        print(f'Ref FAIL: {r.status_code} {r.text[:200]}')
