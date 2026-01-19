const BASE_URL =
  window.EXPO_PUBLIC_API_URL || localStorage.getItem('apiBaseUrl') || 'http://127.0.0.1:5000';

const state = {
  accessToken: null,
  role: null,
  userId: null,
  activeBuyerTab: 'all',
  activeAdminTab: 'users',
  activeSellerTab: 'create',
  currentAuctionId: null,
};

const viewMap = {
  login: document.getElementById('view-login'),
  register: document.getElementById('view-register'),
  buyer: document.getElementById('view-buyer'),
  detail: document.getElementById('view-auction-detail'),
  admin: document.getElementById('view-admin'),
  seller: document.getElementById('view-seller'),
};

const toast = document.getElementById('toast');

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

function showView(name) {
  Object.entries(viewMap).forEach(([key, element]) => {
    element.hidden = key !== name;
  });
}

function formatCurrency(amount, currency = 'EUR') {
  if (amount === null || amount === undefined) {
    return '';
  }
  const numericAmount = Number(amount);
  if (Number.isNaN(numericAmount)) {
    return `${amount}`;
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(numericAmount);
  } catch (error) {
    return `${numericAmount.toFixed(2)} ${currency}`;
  }
}

function parseJwt(token) {
  if (!token) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  try {
    const json = atob(payload);
    return JSON.parse(json);
  } catch (error) {
    return null;
  }
}

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const errorText = await response.text();
    let message = errorText;
    try {
      const parsed = JSON.parse(errorText);
      message = parsed.message || parsed.error || errorText;
    } catch (error) {
      // ignore
    }
    throw new Error(message || response.statusText);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

async function login({ usernameOrEmail, password }) {
  return request('/auth/login', { method: 'POST', body: { usernameOrEmail, password } });
}

async function register({ username, email, password }) {
  return request('/auth/register', { method: 'POST', body: { username, email, password } });
}

async function listAuctions({ status = 'active', scope } = {}, token) {
  const params = new URLSearchParams();
  if (status) {
    params.append('status', status);
  }
  if (scope) {
    params.append('scope', scope);
  }
  const query = params.toString();
  const suffix = query ? `?${query}` : '';
  return request(`/auctions${suffix}`, { token });
}

async function fetchAuction(id) {
  return request(`/auctions/${id}`);
}

async function placeBid(id, amount, token) {
  return request(`/auctions/${id}/bids`, { method: 'POST', body: { amount }, token });
}

async function listUsers(token) {
  return request('/admin/users', { token });
}

async function createUser(data, token) {
  return request('/admin/users', { method: 'POST', body: data, token });
}

async function updateUser(userId, data, token) {
  return request(`/admin/users/${userId}`, { method: 'PATCH', body: data, token });
}

async function listManageAuctions(params, token) {
  const query = new URLSearchParams();
  if (params?.status) {
    query.append('status', params.status);
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/auctions/manage${suffix}`, { token });
}

async function listMyAuctions(params, token) {
  const query = new URLSearchParams();
  if (params?.status) {
    query.append('status', params.status);
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/auctions/mine${suffix}`, { token });
}

async function createAuction(data, token) {
  return request('/auctions', { method: 'POST', body: data, token });
}

async function updateAuction(auctionId, data, token) {
  return request(`/auctions/${auctionId}`, { method: 'PATCH', body: data, token });
}

async function deleteAuction(auctionId, token) {
  return request(`/auctions/${auctionId}`, { method: 'DELETE', token });
}

function setActiveTabs(container, activeKey) {
  const buttons = container.querySelectorAll('[data-tab]');
  buttons.forEach((button) => {
    const isActive = button.dataset.tab === activeKey;
    button.classList.toggle('active', isActive);
  });
}

function getPreviewImage(auction) {
  if (Array.isArray(auction.image_urls) && auction.image_urls.length) {
    return auction.image_urls[0];
  }
  if (Array.isArray(auction.images) && auction.images.length) {
    return auction.images[0];
  }
  return null;
}

function handleLogout() {
  state.accessToken = null;
  state.role = null;
  state.userId = null;
  showView('login');
}

function routeAfterLogin() {
  if (state.role === 'admin') {
    showView('admin');
    renderAdmin();
  } else if (state.role === 'seller') {
    showView('seller');
    renderSeller();
  } else {
    showView('buyer');
    renderBuyer();
  }
}

function attachGlobalHandlers() {
  document.querySelectorAll('[data-action="show-register"]').forEach((button) => {
    button.addEventListener('click', () => showView('register'));
  });
  document.querySelectorAll('[data-action="show-login"]').forEach((button) => {
    button.addEventListener('click', () => showView('login'));
  });
  document.querySelectorAll('[data-action="logout"]').forEach((button) => {
    button.addEventListener('click', handleLogout);
  });
  document.querySelectorAll('[data-action="back"]').forEach((button) => {
    button.addEventListener('click', () => {
      if (state.role === 'admin') {
        showView('admin');
        renderAdmin();
      } else if (state.role === 'seller') {
        showView('seller');
        renderSeller();
      } else {
        showView('buyer');
        renderBuyer();
      }
    });
  });
}

async function handleLogin() {
  const usernameOrEmail = document.getElementById('login-identifier').value.trim();
  const password = document.getElementById('login-password').value;
  if (!usernameOrEmail || !password) {
    showToast('Please enter your credentials.');
    return;
  }
  const button = document.getElementById('login-submit');
  button.disabled = true;
  button.textContent = 'Signing in…';
  try {
    const tokens = await login({ usernameOrEmail, password });
    const claims = parseJwt(tokens.access);
    state.accessToken = tokens.access;
    state.role = tokens?.user?.role || claims?.role || 'buyer';
    state.userId = tokens?.user?.id || claims?.sub || null;
    routeAfterLogin();
  } catch (error) {
    showToast(error.message || 'Login failed.');
  } finally {
    button.disabled = false;
    button.textContent = 'Sign in';
  }
}

async function handleRegister() {
  const username = document.getElementById('register-username').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  if (!username || !email || !password) {
    showToast('All fields are required.');
    return;
  }
  const button = document.getElementById('register-submit');
  button.disabled = true;
  button.textContent = 'Creating account…';
  try {
    await register({ username, email, password });
    showToast('Account created. Please sign in.');
    showView('login');
  } catch (error) {
    showToast(error.message || 'Registration failed.');
  } finally {
    button.disabled = false;
    button.textContent = 'Create account';
  }
}

async function renderBuyer() {
  const list = document.getElementById('buyer-list');
  list.innerHTML = '';
  const tabBar = viewMap.buyer.querySelector('.tab-bar');
  setActiveTabs(tabBar, state.activeBuyerTab);
  try {
    const scope = state.activeBuyerTab === 'participating' ? 'participating' : undefined;
    const auctions = await listAuctions({ status: state.activeBuyerTab === 'all' ? 'active' : 'all', scope });
    if (!auctions.length) {
      list.innerHTML = '<div class="panel-card">No auctions found.</div>';
      return;
    }
    auctions.forEach((auction) => {
      const card = document.createElement('button');
      card.className = 'auction-card';
      card.type = 'button';
      card.addEventListener('click', () => {
        state.currentAuctionId = auction.id;
        showView('detail');
        renderAuctionDetail();
      });
      const image = getPreviewImage(auction);
      if (image) {
        const img = document.createElement('img');
        img.src = image;
        img.alt = auction.title;
        card.appendChild(img);
      }
      const title = document.createElement('h3');
      title.textContent = auction.title;
      card.appendChild(title);
      if (auction.description) {
        const desc = document.createElement('p');
        desc.textContent = auction.description;
        card.appendChild(desc);
      }
      if (auction.buyer_bid_amount != null) {
        const bid = document.createElement('p');
        bid.textContent = `Your bid: ${formatCurrency(auction.buyer_bid_amount, auction.currency)}`;
        card.appendChild(bid);
      }
      if (auction.end_at) {
        const meta = document.createElement('p');
        meta.className = 'meta';
        meta.textContent = `Ends at ${new Date(auction.end_at).toLocaleString()}`;
        card.appendChild(meta);
      }
      list.appendChild(card);
    });
  } catch (error) {
    list.innerHTML = `<div class="panel-card">${error.message}</div>`;
  }
}

async function renderAuctionDetail() {
  const container = document.getElementById('detail-body');
  container.innerHTML = '<div class="panel-card">Loading auction…</div>';
  try {
    const auction = await fetchAuction(state.currentAuctionId);
    const detailCard = document.createElement('div');
    detailCard.className = 'detail-card';
    const image = getPreviewImage(auction);
    if (image) {
      const img = document.createElement('img');
      img.src = image;
      img.alt = auction.title;
      detailCard.appendChild(img);
    }
    const title = document.createElement('h2');
    title.textContent = auction.title;
    detailCard.appendChild(title);
    if (auction.description) {
      const desc = document.createElement('p');
      desc.textContent = auction.description;
      detailCard.appendChild(desc);
    }
    const bestBid = auction.best_bid?.amount ? formatCurrency(auction.best_bid.amount, auction.currency) : 'No bids yet';
    const bidMeta = document.createElement('p');
    bidMeta.innerHTML = `<span class="badge">Current bid</span> ${bestBid}`;
    detailCard.appendChild(bidMeta);
    if (auction.end_at) {
      const end = document.createElement('p');
      end.className = 'meta';
      end.textContent = `Ends at ${new Date(auction.end_at).toLocaleString()}`;
      detailCard.appendChild(end);
    }

    const formCard = document.createElement('div');
    formCard.className = 'detail-card';
    const formTitle = document.createElement('h3');
    formTitle.textContent = 'Place a bid';
    formCard.appendChild(formTitle);
    const amountField = document.createElement('label');
    amountField.className = 'field';
    amountField.innerHTML = '<span>Bid amount</span>';
    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.min = '1';
    amountInput.step = '0.01';
    amountField.appendChild(amountInput);
    formCard.appendChild(amountField);
    const bidButton = document.createElement('button');
    bidButton.className = 'primary-button';
    bidButton.textContent = 'Submit bid';
    bidButton.addEventListener('click', async () => {
      if (!state.accessToken) {
        showToast('Please sign in to bid.');
        return;
      }
      const amount = Number(amountInput.value);
      if (!amount || Number.isNaN(amount)) {
        showToast('Enter a valid bid amount.');
        return;
      }
      bidButton.disabled = true;
      bidButton.textContent = 'Submitting…';
      try {
        await placeBid(auction.id, amount, state.accessToken);
        showToast('Bid submitted.');
        renderAuctionDetail();
      } catch (error) {
        showToast(error.message || 'Bid failed.');
      } finally {
        bidButton.disabled = false;
        bidButton.textContent = 'Submit bid';
      }
    });
    formCard.appendChild(bidButton);

    container.innerHTML = '';
    container.appendChild(detailCard);
    container.appendChild(formCard);
  } catch (error) {
    container.innerHTML = `<div class="panel-card">${error.message}</div>`;
  }
}

async function renderAdmin() {
  const body = document.getElementById('admin-body');
  const tabBar = viewMap.admin.querySelector('.tab-bar');
  setActiveTabs(tabBar, state.activeAdminTab);
  body.innerHTML = '';
  if (state.activeAdminTab === 'users') {
    await renderAdminUsers(body);
  } else {
    await renderAdminAuctions(body);
  }
}

async function renderAdminUsers(container) {
  const formCard = document.createElement('div');
  formCard.className = 'panel-card';
  formCard.innerHTML = '<h3>Create new user</h3>';
  const form = document.createElement('div');
  form.className = 'form-grid';
  const emailInput = createField('Email', 'email');
  const usernameInput = createField('Username', 'text');
  const passwordInput = createField('Password', 'password');
  const roleSelect = document.createElement('select');
  ['buyer', 'seller', 'admin'].forEach((role) => {
    const option = document.createElement('option');
    option.value = role;
    option.textContent = role.charAt(0).toUpperCase() + role.slice(1);
    roleSelect.appendChild(option);
  });
  const roleField = wrapField('Role', roleSelect);
  form.appendChild(emailInput.wrapper);
  form.appendChild(usernameInput.wrapper);
  form.appendChild(passwordInput.wrapper);
  form.appendChild(roleField);
  const submit = document.createElement('button');
  submit.className = 'primary-button';
  submit.textContent = 'Create user';
  submit.addEventListener('click', async () => {
    if (!emailInput.input.value || !usernameInput.input.value || !passwordInput.input.value) {
      showToast('Email, username and password are required.');
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Creating…';
    try {
      await createUser(
        {
          email: emailInput.input.value.trim(),
          username: usernameInput.input.value.trim(),
          password: passwordInput.input.value,
          role: roleSelect.value,
        },
        state.accessToken,
      );
      showToast('User created.');
      renderAdmin();
    } catch (error) {
      showToast(error.message || 'Creation failed.');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Create user';
    }
  });
  form.appendChild(submit);
  formCard.appendChild(form);

  const listCard = document.createElement('div');
  listCard.className = 'panel-card';
  listCard.innerHTML = '<h3>Existing users</h3>';
  const list = document.createElement('div');
  listCard.appendChild(list);

  container.appendChild(formCard);
  container.appendChild(listCard);

  try {
    const users = await listUsers(state.accessToken);
    if (!users.length) {
      list.innerHTML = '<p>No users found.</p>';
      return;
    }
    users.forEach((user) => {
      const card = document.createElement('div');
      card.className = 'auction-card';
      card.innerHTML = `<h3>${user.username}</h3><p>${user.email}</p><p class="meta">Status: ${user.status}</p>`;
      const roleButtons = document.createElement('div');
      roleButtons.className = 'button-row';
      ['buyer', 'seller', 'admin'].forEach((role) => {
        const button = document.createElement('button');
        button.className = 'small-button';
        button.textContent = role;
        if (user.role === role) {
          button.classList.add('active');
          button.disabled = true;
        }
        button.addEventListener('click', async () => {
          try {
            await updateUser(user.id, { role }, state.accessToken);
            showToast('Role updated.');
            renderAdmin();
          } catch (error) {
            showToast(error.message || 'Update failed.');
          }
        });
        roleButtons.appendChild(button);
      });
      card.appendChild(roleButtons);
      list.appendChild(card);
    });
  } catch (error) {
    list.innerHTML = `<p>${error.message}</p>`;
  }
}

async function renderAdminAuctions(container) {
  const listCard = document.createElement('div');
  listCard.className = 'panel-card';
  listCard.innerHTML = '<h3>Active auctions</h3>';
  const list = document.createElement('div');
  listCard.appendChild(list);
  container.appendChild(listCard);
  try {
    const auctions = await listManageAuctions({ status: 'all' }, state.accessToken);
    renderAuctionManagementList(list, auctions, true);
  } catch (error) {
    list.innerHTML = `<p>${error.message}</p>`;
  }
}

async function renderSeller() {
  const body = document.getElementById('seller-body');
  const tabBar = viewMap.seller.querySelector('.tab-bar');
  setActiveTabs(tabBar, state.activeSellerTab);
  body.innerHTML = '';
  if (state.activeSellerTab === 'create') {
    body.appendChild(renderCreateAuctionForm());
  } else {
    const listCard = document.createElement('div');
    listCard.className = 'panel-card';
    listCard.innerHTML = '<h3>My auctions</h3>';
    const list = document.createElement('div');
    listCard.appendChild(list);
    body.appendChild(listCard);
    try {
      const auctions = await listMyAuctions({ status: 'all' }, state.accessToken);
      renderAuctionManagementList(list, auctions, false);
    } catch (error) {
      list.innerHTML = `<p>${error.message}</p>`;
    }
  }
}

function renderAuctionManagementList(container, auctions, isAdmin) {
  container.innerHTML = '';
  if (!auctions.length) {
    container.innerHTML = '<p>No auctions found.</p>';
    return;
  }
  auctions.forEach((auction) => {
    const card = document.createElement('div');
    card.className = 'auction-card';
    const image = getPreviewImage(auction);
    if (image) {
      const img = document.createElement('img');
      img.src = image;
      img.alt = auction.title;
      card.appendChild(img);
    }
    const title = document.createElement('h3');
    title.textContent = auction.title;
    card.appendChild(title);
    const status = document.createElement('p');
    status.className = 'meta';
    status.textContent = `Status: ${auction.status}`;
    card.appendChild(status);
    if (auction.description) {
      const desc = document.createElement('p');
      desc.textContent = auction.description;
      card.appendChild(desc);
    }
    if (isAdmin && auction.seller_username) {
      const seller = document.createElement('p');
      seller.textContent = `Seller: ${auction.seller_username}`;
      card.appendChild(seller);
    }
    if (auction.end_at) {
      const end = document.createElement('p');
      end.className = 'meta';
      end.textContent = `Ends at ${new Date(auction.end_at).toLocaleString()}`;
      card.appendChild(end);
    }
    const buttonRow = document.createElement('div');
    buttonRow.className = 'button-row';

    const viewButton = document.createElement('button');
    viewButton.className = 'small-button';
    viewButton.textContent = 'View';
    viewButton.addEventListener('click', () => {
      state.currentAuctionId = auction.id;
      showView('detail');
      renderAuctionDetail();
    });
    buttonRow.appendChild(viewButton);

    const editButton = document.createElement('button');
    editButton.className = 'small-button';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => {
      const editForm = renderEditAuctionForm(auction);
      card.appendChild(editForm);
      editButton.disabled = true;
    });
    buttonRow.appendChild(editButton);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'small-button danger';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', async () => {
      deleteButton.disabled = true;
      try {
        await deleteAuction(auction.id, state.accessToken);
        showToast('Auction deleted.');
        if (isAdmin) {
          renderAdmin();
        } else {
          renderSeller();
        }
      } catch (error) {
        deleteButton.disabled = false;
        showToast(error.message || 'Delete failed.');
      }
    });
    buttonRow.appendChild(deleteButton);

    card.appendChild(buttonRow);
    container.appendChild(card);
  });
}

function renderEditAuctionForm(auction) {
  const form = document.createElement('div');
  form.className = 'form-grid';
  const titleField = createField('Title', 'text', auction.title);
  const descField = createField('Description', 'text', auction.description || '', true);
  const saveButton = document.createElement('button');
  saveButton.className = 'primary-button';
  saveButton.textContent = 'Save changes';
  saveButton.addEventListener('click', async () => {
    saveButton.disabled = true;
    saveButton.textContent = 'Saving…';
    try {
      await updateAuction(
        auction.id,
        {
          title: titleField.input.value.trim(),
          description: descField.input.value.trim(),
        },
        state.accessToken,
      );
      showToast('Auction updated.');
      if (state.role === 'admin') {
        renderAdmin();
      } else {
        renderSeller();
      }
    } catch (error) {
      showToast(error.message || 'Update failed.');
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = 'Save changes';
    }
  });
  form.appendChild(titleField.wrapper);
  form.appendChild(descField.wrapper);
  form.appendChild(saveButton);
  return form;
}

function renderCreateAuctionForm() {
  const wrapper = document.createElement('div');
  wrapper.className = 'panel-card';
  wrapper.innerHTML = '<h3>Register a new auction</h3><p>Fill in the auction details below to publish it immediately.</p>';
  const form = document.createElement('div');
  form.className = 'form-grid';
  const titleField = createField('Auction name', 'text');
  const descField = createField('Description', 'text', '', true);
  const imagesField = document.createElement('input');
  imagesField.type = 'file';
  imagesField.accept = 'image/*';
  imagesField.multiple = true;
  const imagesWrapper = wrapField('Vehicle photos', imagesField);
  const carteField = document.createElement('input');
  carteField.type = 'file';
  carteField.accept = 'image/*';
  const carteWrapper = wrapField('Carte grise image', carteField);

  const submit = document.createElement('button');
  submit.className = 'primary-button';
  submit.textContent = 'Publish auction';
  submit.addEventListener('click', async () => {
    if (!titleField.input.value.trim() || !descField.input.value.trim()) {
      showToast('Title and description are required.');
      return;
    }
    if (!carteField.files || !carteField.files[0]) {
      showToast('Please attach the carte grise image.');
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Publishing…';
    try {
      const images = await filesToDataUrls(imagesField.files, 8);
      const carte = await fileToDataUrl(carteField.files[0]);
      await createAuction(
        {
          title: titleField.input.value.trim(),
          description: descField.input.value.trim(),
          currency: 'EUR',
          images,
          carte_grise_image: carte,
        },
        state.accessToken,
      );
      showToast('Auction created.');
      state.activeSellerTab = 'manage';
      renderSeller();
    } catch (error) {
      showToast(error.message || 'Creation failed.');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Publish auction';
    }
  });

  form.appendChild(titleField.wrapper);
  form.appendChild(descField.wrapper);
  form.appendChild(imagesWrapper);
  form.appendChild(carteWrapper);
  form.appendChild(submit);
  wrapper.appendChild(form);
  return wrapper;
}

function createField(label, type, value = '', isTextarea = false) {
  const input = isTextarea ? document.createElement('textarea') : document.createElement('input');
  input.type = isTextarea ? undefined : type;
  input.value = value;
  return { wrapper: wrapField(label, input), input };
}

function wrapField(label, input) {
  const wrapper = document.createElement('label');
  wrapper.className = 'field';
  const span = document.createElement('span');
  span.textContent = label;
  wrapper.appendChild(span);
  wrapper.appendChild(input);
  return wrapper;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

async function filesToDataUrls(files, max) {
  const selected = Array.from(files || []).slice(0, max);
  const results = [];
  for (const file of selected) {
    const dataUrl = await fileToDataUrl(file);
    results.push(dataUrl);
  }
  return results;
}

function attachTabHandlers() {
  viewMap.buyer.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeBuyerTab = button.dataset.tab;
      renderBuyer();
    });
  });
  viewMap.admin.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeAdminTab = button.dataset.tab;
      renderAdmin();
    });
  });
  viewMap.seller.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeSellerTab = button.dataset.tab;
      renderSeller();
    });
  });
}

document.getElementById('login-submit').addEventListener('click', handleLogin);
document.getElementById('register-submit').addEventListener('click', handleRegister);
attachGlobalHandlers();
attachTabHandlers();
showView('login');
