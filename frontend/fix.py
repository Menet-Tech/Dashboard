import os
import re

files_to_fix = [
    'src/App.tsx',
    'src/components/layout/Sidebar.tsx',
    'src/context/DialogContext.tsx',
    'src/context/FeedbackContext.tsx',
    'src/features/bills/BillsPage.tsx',
    'src/features/customers/CustomersPage.tsx',
    'src/features/dashboard/DashboardPage.tsx'
]

for file_path in files_to_fix:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # My previous script did:
    # 1. <button ... bg-indigo-600 ...>  --> <Button variant="primary" ...>
    # 2. </button> --> </Button> globally
    
    # Let's revert step 2 (change all </Button> back to </button>)
    content = content.replace('</Button>', '</button>')
    
    # Now we have <Button ...> and it's closed by </button>
    # We need to find all <Button ...> and change their corresponding </button> to </Button>
    # Since React code can be nested, we can just replace </button> to </Button> if we see a <Button tag earlier in the block?
    # Actually, the simplest fix is to just revert <Button variant="primary" back to <button class="bg-indigo-600...
    # But wait, my script erased the original classes!
    
    # Better: just use a stack based XML parser (or simply regex) to fix </button> to </Button> for <Button> tags.
    tokens = re.split(r'(<Button[^>]*>|<button[^>]*>|</Button>|</button>)', content)
    
    stack = []
    for i, token in enumerate(tokens):
        if token.startswith('<Button'):
            stack.append('Button')
        elif token.startswith('<button'):
            stack.append('button')
        elif token == '</Button>' or token == '</button>':
            if len(stack) > 0:
                expected = stack.pop()
                tokens[i] = f'</{expected}>'
                
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(''.join(tokens))