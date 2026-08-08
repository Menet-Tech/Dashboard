const fs = require('fs');
const file = 'frontend/src/features/customers/components/CustomerFormCard.tsx';
let content = fs.readFileSync(file, 'utf8');

// replace customerForm usage with localForm inside the body of the component, but not the prop destructuring
content = content.replace(/customerForm\./g, 'localForm.');
// replace onFormChange updater calls with setLocalForm calls
content = content.replace(/onFormChange\(/g, 'setLocalForm(');

// add useState, useEffect
content = content.replace('import { type FormEvent } from "react";', 'import { type FormEvent, useState, useEffect } from "react";');

// Insert localForm declaration at the top of the component body
const insertion = `const isEditing = Boolean(editingCustomerId);
  const [localForm, setLocalForm] = useState<CustomerFormState>(customerForm);

  useEffect(() => {
    setLocalForm(customerForm);
  }, [customerForm]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // @ts-ignore
    onSubmit(e, localForm);
  };`;
content = content.replace('const isEditing = Boolean(editingCustomerId);', insertion);

// Replace onSubmit in the form tag
content = content.replace('<form id="customer-form" onSubmit={onSubmit}', '<form id="customer-form" onSubmit={handleSubmit}');

fs.writeFileSync(file, content);
console.log('File updated successfully.');
