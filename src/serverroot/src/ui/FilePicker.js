export function createFilePicker(labelText, input, { choose, empty }) {
  const label = document.createElement('label');
  label.className = 'practice-label file-picker';
  const title = document.createElement('span');
  title.textContent = labelText;
  const control = document.createElement('span');
  control.className = 'file-picker-control';
  const action = document.createElement('span');
  action.className = 'file-picker-action';
  action.textContent = choose;
  action.setAttribute('aria-hidden', 'true');
  const filename = document.createElement('span');
  filename.className = 'file-picker-name';
  filename.setAttribute('aria-live', 'polite');
  input.classList.add('file-picker-input');
  input.setAttribute('aria-label', labelText);
  function update() {
    filename.textContent = input.files.length ? Array.from(input.files, file => file.name).join(', ') : empty;
  }
  input.addEventListener('change', update);
  update();
  control.append(action, filename);
  label.append(title, input, control);
  return { element: label, update };
}
