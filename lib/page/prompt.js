const fs = require('fs');
const {ipcRenderer} = require('electron');

let promptId = null;
let promptOptions = null;
let matchCase = false;

ipcRenderer.on('found-in-page-results', (event, results) => {
  const matchCounterElement = document.querySelector('#match-counter');

  if (results.matches == 0) {
    matchCounterElement.innerHTML = '0/0';
  } else {
    matchCounterElement.innerHTML = `${results.activeMatchOrdinal}/${results.matches}`;
  }
})

function promptError(error) {
	if (error instanceof Error) {
		error = error.message;
	}

	ipcRenderer.sendSync('prompt-error:' + promptId, error);
}

function promptCancel() {
	ipcRenderer.sendSync('prompt-cancel:' + promptId, null);
}

function promptFind(searchForward) {
	const dataElement = document.querySelector('#data');
	let data = null;

	if (promptOptions.type === 'input') {
		data = dataElement.value;
	} else if (promptOptions.type === 'select') {
		if (promptOptions.selectMultiple) {
			data = dataElement.querySelectorAll('option[selected]').map(o => o.getAttribute('value'));
		} else {
			data = dataElement.value;
		}
	}

	ipcRenderer.send('prompt-find:' + promptId, {
		text: data,
		forward: searchForward,
		matchCase: matchCase
	});
}

function promptCreateInput() {
	const dataElement = document.createElement('input');
	dataElement.setAttribute('type', 'text');

	if (promptOptions.value) {
		dataElement.value = promptOptions.value;
	} else {
		dataElement.value = '';
	}

	if (promptOptions.inputAttrs && typeof (promptOptions.inputAttrs) === 'object') {
		for (const k in promptOptions.inputAttrs) {
			if (!Object.prototype.hasOwnProperty.call(promptOptions.inputAttrs, k)) {
				continue;
			}

			dataElement.setAttribute(k, promptOptions.inputAttrs[k]);
		}
	}

	dataElement.addEventListener('keyup', event => {
		if (event.key === 'Escape') {
			promptCancel();
		}
	});

	dataElement.addEventListener('keypress', event => {
		if (event.key === 'Enter') {
			event.preventDefault();
			if (event.shiftKey) {
				document.querySelector('#find-previous').click();
			} else {
				document.querySelector('#find-next').click();
			}
		}
	});

	// search as user types
	let typingTimeout;
	dataElement.addEventListener('input', event => {
		const searchText = dataElement.value || '';

		if (typingTimeout) {
			clearTimeout(typingTimeout);
		}

		// delay search by 100ms to wait for pause in typing before searching
		typingTimeout = setTimeout(() => {
			ipcRenderer.send('prompt-find:' + promptId, {
				text: searchText,
				forward: true,
				matchCase: matchCase
			});
		}, 100);
	});

	return dataElement;
}

function promptCreateSelect() {
	const dataElement = document.createElement('select');
	let optionElement;

	for (const k in promptOptions.selectOptions) {
		if (!Object.prototype.hasOwnProperty.call(promptOptions.selectOptions, k)) {
			continue;
		}

		optionElement = document.createElement('option');
		optionElement.setAttribute('value', k);
		optionElement.textContent = promptOptions.selectOptions[k];
		if (k === promptOptions.value) {
			optionElement.setAttribute('selected', 'selected');
		}

		dataElement.append(optionElement);
	}

	return dataElement;
}

function promptRegister() {
	promptId = document.location.hash.replace('#', '');

	try {
		promptOptions = JSON.parse(ipcRenderer.sendSync('prompt-get-options:' + promptId));
	} catch (error) {
		return promptError(error);
	}


	try {
		if (promptOptions.customStylesheet) {
			const customStyleContent = fs.readFileSync(promptOptions.customStylesheet);
			if (customStyleContent) {
				const customStyle = document.createElement('style');
				customStyle.setAttribute('rel', 'stylesheet');
				customStyle.append(document.createTextNode(customStyleContent));
				document.head.append(customStyle);
			}
		}
	} catch (error) {
		return promptError(error);
	}

	document.querySelector('#find-next').addEventListener('click', () => promptFind(true));
	document.querySelector('#find-previous').addEventListener('click', () => promptFind(false));
	document.querySelector('#cancel').addEventListener('click', promptCancel);

	const matchCaseButton = document.querySelector('#match-case');

	matchCaseButton.addEventListener('click', function() {
		matchCase = !matchCase;
		this.classList.toggle('active', matchCase);

		// Re-trigger search with new option
		const dataElement = document.querySelector('#data');
		if (dataElement && dataElement.value) {
			promptFind(true);
		}
	});

	const dataContainerElement = document.querySelector('#data-container');

	let dataElement;
	if (promptOptions.type === 'input') {
		dataElement = promptCreateInput();
	} else if (promptOptions.type === 'select') {
		dataElement = promptCreateSelect();
	} else {
		return promptError(`Unhandled input type '${promptOptions.type}'`);
	}

	dataContainerElement.append(dataElement);
	dataElement.setAttribute('id', 'data');

	dataElement.focus();
	if (promptOptions.type === 'input') {
		dataElement.select();
	}
}

window.addEventListener('error', error => {
	if (promptId) {
		promptError('An error has occured on the prompt window: \n' + error);
	}
});

document.addEventListener('DOMContentLoaded', promptRegister);
