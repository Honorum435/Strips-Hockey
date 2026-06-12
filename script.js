// ============================================================
//  STRIPS HOCKEY — Lógica de la tienda
// ============================================================

// --- BACKEND (SUPABASE) ---
// La clave "publishable" es pública por diseño: la seguridad real está en las
// políticas RLS y en la función crear_pedido del servidor.
const SUPABASE_URL = "https://gmedryyxhbbkrbaqhlpu.supabase.co";
const SUPABASE_KEY = "sb_publishable_qywSQhP-JW39cNgUTzEy9w_fOaZ43ya";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- VARIABLES GLOBALES ---
let usuarioLogueado = null;
let estadoModal = 'login';

const MINIMO_MAYORISTA = 30;
const CANTIDAD_MAXIMA_POR_ITEM = 999;
const numeroWhatsApp = "5493435323222"; // RECORDÁ CAMBIAR ESTO POR TU NÚMERO

// Precios de respaldo por si la base de datos no responde (la página sigue usable).
// Los precios reales se cargan desde Supabase en cargarCatalogo().
const PRECIO_MINORISTA_FALLBACK = 7500;
const PRECIO_MAYORISTA_FALLBACK = 4500;

// Catálogo cargado desde la base de datos: code -> { nombre, retail, wholesale }
let catalogo = new Map();

// Limpieza de datos del sistema viejo de cuentas (guardaba claves en el navegador)
localStorage.removeItem('usuarios_general');
localStorage.removeItem('usuario_logueado');

// --- SEGURIDAD: HELPERS ---

// Escapa caracteres peligrosos antes de insertar texto en innerHTML (previene XSS)
function escapeHTML(texto) {
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const REGEX_EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

// --- 1. LÓGICA DE MENÚ (SCROLLSPY) ---
const enlacesMenu = document.querySelectorAll('.nav-link');
const seccionesPantalla = document.querySelectorAll('.seccion-scroll');

window.addEventListener('scroll', () => {
    let seccionActual = '';
    seccionesPantalla.forEach(seccion => {
        if (window.scrollY >= seccion.offsetTop - 150) seccionActual = seccion.getAttribute('id');
    });
    if (Math.ceil(window.innerHeight + window.scrollY) >= document.body.offsetHeight - 20) {
        if (seccionesPantalla.length > 0) {
            seccionActual = seccionesPantalla[seccionesPantalla.length - 1].getAttribute('id');
        }
    }
    enlacesMenu.forEach(enlace => {
        enlace.classList.toggle('is-active', enlace.getAttribute('href') === `#${seccionActual}`);
    });
});

// --- 1b. MENÚ HAMBURGUESA (MÓVIL) ---
const botonMenu = document.getElementById('menu-toggle');
const menuMovil = document.getElementById('menu-movil');

if (botonMenu && menuMovil) {
    const iconoMenu = botonMenu.querySelector('.material-symbols-outlined');
    botonMenu.addEventListener('click', () => {
        const abierto = menuMovil.classList.toggle('is-open');
        botonMenu.setAttribute('aria-expanded', abierto ? 'true' : 'false');
        if (iconoMenu) iconoMenu.innerText = abierto ? 'close' : 'menu';
    });
    // Cerrar el menú al elegir una opción
    menuMovil.querySelectorAll('.mobile-link').forEach(enlace => {
        enlace.addEventListener('click', () => {
            menuMovil.classList.remove('is-open');
            botonMenu.setAttribute('aria-expanded', 'false');
            if (iconoMenu) iconoMenu.innerText = 'menu';
        });
    });
}

// --- 2. LÓGICA DE INFO (MODAL UNIVERSAL) ---
const contenidosInfo = {
    'envios': { titulo: "Envíos a todo el país", info: "Hacemos envíos a toda Argentina por correo privado o encomienda. Una vez realizada la compra, te contactamos por WhatsApp para pasarte el presupuesto y coordinar el despacho." },
    'retiro': { titulo: "Retiro en local", info: "Podés retirar tu pedido sin cargo en nuestro local ubicado en <b>Paraná, Entre Ríos</b>. Una vez que confirmemos tu compra, te enviaremos la dirección exacta y los horarios disponibles." },
    'mayorista': { titulo: "Contacto Mayorista", info: "¡Queremos ser parte de tu club o comercio! Escribinos directamente al WhatsApp o registrate en nuestra web." },
    'pago': { titulo: "Medios de pago", info: "Aceptamos <b>Transferencia Bancaria</b> (obteniendo un 10% de descuento automático) y todos los medios de pago a través de <b>Mercado Pago</b>." }
};

function abrirInfo(seccion) {
    const modal = document.getElementById('modal-info');
    if (!modal || !contenidosInfo[seccion]) return;
    document.getElementById('info-titulo').innerText = contenidosInfo[seccion].titulo;
    document.getElementById('info-texto').innerHTML = contenidosInfo[seccion].info;
    modal.classList.add('is-open');
    setTimeout(() => modal.classList.add('is-visible'), 10);
}

function cerrarInfo() {
    const modal = document.getElementById('modal-info');
    if (!modal) return;
    modal.classList.remove('is-visible');
    setTimeout(() => modal.classList.remove('is-open'), 300);
}

// Botones del footer y cierre del modal info (sin onclick inline por la CSP)
document.querySelectorAll('[data-info]').forEach(boton => {
    boton.addEventListener('click', () => abrirInfo(boton.dataset.info));
});
const btnCerrarInfo = document.getElementById('cerrar-modal-info');
if (btnCerrarInfo) btnCerrarInfo.addEventListener('click', cerrarInfo);

// --- 3. LÓGICA DE USUARIOS Y LOGIN (SUPABASE AUTH) ---
const btnMiCuenta = document.getElementById('btn-mi-cuenta');
const textoBtnCuenta = document.getElementById('texto-btn-cuenta');
const modalCuenta = document.getElementById('modal-cuenta');
const btnCerrarModal = document.getElementById('cerrar-modal-cuenta');
const inputEmail = document.getElementById('email-cuenta');
const inputPass = document.getElementById('pass-cuenta');
const inputConfirmPass = document.getElementById('pass-confirm-cuenta');
const divPass = document.getElementById('div-pass');
const divConfirmPass = document.getElementById('div-confirm-pass');
const divRecuperarLink = document.getElementById('div-recuperar-link');
const btnOlvidePass = document.getElementById('btn-olvide-pass');
const labelPass = document.getElementById('label-pass');
const btnIngresar = document.getElementById('btn-ingresar-cuenta');
const errorPass = document.getElementById('error-cuenta');
const tabLogin = document.getElementById('tab-login');
const tabRegistro = document.getElementById('tab-registro');
const modalTitulo = document.getElementById('modal-titulo');
const modalDesc = document.getElementById('modal-descripcion');

function mostrarError(mensaje) {
    if (!errorPass) return;
    errorPass.innerText = mensaje;
    errorPass.classList.remove('hidden');
}

function actualizarInterfazUsuario() {
    if (!btnMiCuenta) return;
    if (usuarioLogueado) {
        textoBtnCuenta.innerText = "Cerrar Sesión";
        btnMiCuenta.classList.add('is-logged');
    } else {
        textoBtnCuenta.innerText = "Iniciar Sesión";
        btnMiCuenta.classList.remove('is-logged');
    }
}

// Supabase mantiene la sesión y avisa cualquier cambio (login, logout, expiración)
db.auth.onAuthStateChange((evento, sesion) => {
    usuarioLogueado = sesion && sesion.user ? sesion.user.email : null;
    actualizarInterfazUsuario();
});

if (btnMiCuenta) {
    btnMiCuenta.addEventListener('click', async () => {
        if (usuarioLogueado) {
            await db.auth.signOut();
            carrito = [];
            guardarCarrito();
            actualizarVistaCarrito();
            alert("Has cerrado sesión exitosamente.");
            return;
        }
        abrirModalCuenta();
    });
}

function abrirModalCuenta() {
    if (!modalCuenta) return;
    cambiarPestaña('login');
    modalCuenta.classList.add('is-open');
    setTimeout(() => modalCuenta.classList.add('is-visible'), 10);
}

function cerrarModalCuenta() {
    if (!modalCuenta) return;
    modalCuenta.classList.remove('is-visible');
    setTimeout(() => modalCuenta.classList.remove('is-open'), 300);
    if (errorPass) errorPass.classList.add('hidden');
    if (inputPass) inputPass.value = "";
    if (inputEmail) inputEmail.value = "";
    if (inputConfirmPass) inputConfirmPass.value = "";
}

if (btnCerrarModal) btnCerrarModal.addEventListener('click', cerrarModalCuenta);

function cambiarPestaña(nuevoEstado) {
    estadoModal = nuevoEstado;
    if (errorPass) errorPass.classList.add('hidden');
    if (inputPass) inputPass.value = "";
    if (inputConfirmPass) inputConfirmPass.value = "";

    if (tabLogin) tabLogin.classList.remove('is-active');
    if (tabRegistro) tabRegistro.classList.remove('is-active');
    if (divPass) divPass.classList.remove('hidden');

    if (estadoModal === 'login') {
        if (tabLogin) tabLogin.classList.add('is-active');
        if (modalTitulo) modalTitulo.innerHTML = `<span class="material-symbols-outlined">login</span> Ingresar`;
        if (modalDesc) modalDesc.innerText = "Iniciá sesión para poder finalizar tus compras.";
        if (labelPass) labelPass.innerText = "Contraseña";
        if (btnIngresar) btnIngresar.innerText = "Ingresar";
        if (divConfirmPass) divConfirmPass.classList.add('hidden');
        if (divRecuperarLink) divRecuperarLink.classList.remove('hidden');
    } else if (estadoModal === 'registro') {
        if (tabRegistro) tabRegistro.classList.add('is-active');
        if (modalTitulo) modalTitulo.innerHTML = `<span class="material-symbols-outlined">person_add</span> Registrarme`;
        if (modalDesc) modalDesc.innerText = "Creá tu cuenta. Es obligatorio para poder comprar.";
        if (labelPass) labelPass.innerText = "Crear Contraseña";
        if (btnIngresar) btnIngresar.innerText = "Registrar Cuenta";
        if (divConfirmPass) divConfirmPass.classList.remove('hidden');
        if (divRecuperarLink) divRecuperarLink.classList.add('hidden');
    } else if (estadoModal === 'recuperar') {
        if (modalTitulo) modalTitulo.innerHTML = `<span class="material-symbols-outlined">key_reset</span> Recuperar Clave`;
        if (modalDesc) modalDesc.innerText = "Ingresá tu mail y te enviamos un enlace para crear una nueva contraseña.";
        if (btnIngresar) btnIngresar.innerText = "Enviar email de recuperación";
        if (divPass) divPass.classList.add('hidden');
        if (divConfirmPass) divConfirmPass.classList.add('hidden');
        if (divRecuperarLink) divRecuperarLink.classList.add('hidden');
    }
}

if (tabLogin) tabLogin.addEventListener('click', () => cambiarPestaña('login'));
if (tabRegistro) tabRegistro.addEventListener('click', () => cambiarPestaña('registro'));
if (btnOlvidePass) btnOlvidePass.addEventListener('click', () => cambiarPestaña('recuperar'));

// Traducción de los errores más comunes de Supabase
function traducirErrorAuth(error) {
    const mensaje = (error && error.message) || "";
    if (mensaje.includes("Invalid login credentials")) return "Email o contraseña incorrectos.";
    if (mensaje.includes("already registered")) return "Este email ya está registrado.";
    if (mensaje.includes("Email not confirmed")) return "Tenés que confirmar tu email antes de ingresar. Revisá tu casilla.";
    if (mensaje.includes("rate limit") || mensaje.includes("Too many")) return "Demasiados intentos. Esperá unos minutos.";
    if (mensaje.includes("Password should be")) return "La contraseña es demasiado corta.";
    return "Ocurrió un error. Intentá de nuevo en unos minutos.";
}

if (btnIngresar) {
    btnIngresar.addEventListener('click', async () => {
        const email = inputEmail.value.trim().toLowerCase();
        const pass = inputPass.value;
        const passConfirm = inputConfirmPass ? inputConfirmPass.value : "";

        if (!email || !REGEX_EMAIL.test(email)) {
            mostrarError("Ingresá un email válido.");
            return;
        }

        btnIngresar.disabled = true;
        try {
            if (estadoModal === 'login') {
                if (!pass) {
                    mostrarError("Completá todos los campos.");
                    return;
                }
                const { error } = await db.auth.signInWithPassword({ email: email, password: pass });
                if (error) {
                    mostrarError(traducirErrorAuth(error));
                    return;
                }
                cerrarModalCuenta();
            } else if (estadoModal === 'registro') {
                if (pass.length < 8) {
                    mostrarError("La contraseña debe tener al menos 8 caracteres.");
                    return;
                }
                if (pass !== passConfirm) {
                    mostrarError("Las contraseñas no coinciden.");
                    return;
                }
                const { data, error } = await db.auth.signUp({ email: email, password: pass });
                if (error) {
                    mostrarError(traducirErrorAuth(error));
                    return;
                }
                cerrarModalCuenta();
                if (data.session) {
                    alert("¡Cuenta creada! Ya podés comprar.");
                } else {
                    alert("¡Cuenta creada! Te enviamos un email para confirmarla. Revisá tu casilla (y el spam) antes de ingresar.");
                }
            } else if (estadoModal === 'recuperar') {
                const { error } = await db.auth.resetPasswordForEmail(email);
                if (error) {
                    mostrarError(traducirErrorAuth(error));
                    return;
                }
                alert("Si el email está registrado, te enviamos un enlace para recuperar la contraseña.");
                cambiarPestaña('login');
            }
        } finally {
            btnIngresar.disabled = false;
        }
    });
}

// --- 4. LÓGICA DE CARRITO ---
const panelCarrito = document.getElementById('cart-panel');
const fondoCarrito = document.getElementById('cart-overlay');
const contenedorItems = document.getElementById('cart-items');
const contadorCarrito = document.getElementById('contador-carrito');

// Códigos de producto que existen como tarjeta en la página
const codigosEnPagina = new Set(
    Array.from(document.querySelectorAll('.product-card[data-code]')).map(t => t.dataset.code)
);

// Devuelve el precio unitario de un producto según si el pedido es mayorista o no.
// Usa el catálogo de la base de datos y cae a los precios de respaldo si hace falta.
function precioUnitario(code, esMayorista) {
    const prod = catalogo.get(code);
    if (prod) return esMayorista ? prod.wholesale : prod.retail;
    return esMayorista ? PRECIO_MAYORISTA_FALLBACK : PRECIO_MINORISTA_FALLBACK;
}

// El precio mayorista de referencia que se muestra en los avisos del carrito
function precioMayoristaReferencia() {
    for (const prod of catalogo.values()) return prod.wholesale;
    return PRECIO_MAYORISTA_FALLBACK;
}

// Carga nombres y precios desde la base de datos y los refleja en las tarjetas
async function cargarCatalogo() {
    try {
        const { data, error } = await db
            .from('products')
            .select('code, name, price_retail, price_wholesale')
            .eq('active', true);
        if (error || !data) return;

        catalogo = new Map(
            data.map(p => [p.code, {
                nombre: p.name,
                retail: Number(p.price_retail),
                wholesale: Number(p.price_wholesale)
            }])
        );

        // Refleja el precio minorista en cada tarjeta de producto
        document.querySelectorAll('.product-card[data-code]').forEach(tarjeta => {
            const prod = catalogo.get(tarjeta.dataset.code);
            if (!prod) return;
            const precioEl = tarjeta.querySelector('.product-price');
            if (precioEl) precioEl.innerText = `$${prod.retail.toLocaleString('es-AR')}`;
        });

        // Si el carrito tenía nombres viejos, los sincroniza con el catálogo
        carrito.forEach(item => {
            const prod = catalogo.get(item.code);
            if (prod) item.nombre = prod.nombre;
        });
        actualizarVistaCarrito();
    } catch (e) {
        // Sin conexión a la base usamos los precios de respaldo; no rompemos la página.
    }
}

function guardarCarrito() {
    localStorage.setItem('carrito_strips', JSON.stringify(carrito));
}

// Carga el carrito guardado descartando cualquier dato inválido o manipulado
function cargarCarrito() {
    let guardado = [];
    try {
        guardado = JSON.parse(localStorage.getItem('carrito_strips')) || [];
    } catch (e) {
        return [];
    }
    if (!Array.isArray(guardado)) return [];
    return guardado
        .filter(item =>
            item &&
            typeof item.code === 'string' &&
            codigosEnPagina.has(item.code) &&
            Number.isInteger(item.cantidad) &&
            item.cantidad > 0
        )
        .map(item => ({
            code: item.code,
            nombre: typeof item.nombre === 'string' ? item.nombre : item.code,
            cantidad: Math.min(item.cantidad, CANTIDAD_MAXIMA_POR_ITEM)
        }));
}

let carrito = cargarCarrito();

function abrirCarrito() {
    if (!panelCarrito || !fondoCarrito) return;
    panelCarrito.classList.add('is-open');
    fondoCarrito.classList.remove('hidden');
    setTimeout(() => fondoCarrito.classList.add('is-visible'), 10);
    actualizarVistaCarrito();
}

function cerrarCarrito() {
    if (!panelCarrito || !fondoCarrito) return;
    panelCarrito.classList.remove('is-open');
    fondoCarrito.classList.remove('is-visible');
    setTimeout(() => fondoCarrito.classList.add('hidden'), 300);
}

const btnAbrirCarrito = document.getElementById('btn-abrir-carrito');
const btnCerrarCarrito = document.getElementById('close-cart');
if (btnAbrirCarrito) btnAbrirCarrito.addEventListener('click', abrirCarrito);
if (btnCerrarCarrito) btnCerrarCarrito.addEventListener('click', cerrarCarrito);
if (fondoCarrito) fondoCarrito.addEventListener('click', cerrarCarrito);

function actualizarVistaCarrito() {
    if (!contenedorItems) return;
    let cantidadTotalItems = carrito.reduce((suma, item) => suma + item.cantidad, 0);
    let esMayorista = cantidadTotalItems >= MINIMO_MAYORISTA;
    let subtotal = 0;

    const cartSub = document.getElementById('cart-subtotal');
    const cartTot = document.getElementById('cart-total-transferencia');

    if (carrito.length === 0) {
        contenedorItems.innerHTML = `
            <div class="cart-empty">
                <span class="material-symbols-outlined">shopping_cart</span>
                <p>El carrito está vacío</p>
            </div>`;
        if (cartSub) cartSub.innerText = "$0";
        if (cartTot) cartTot.innerText = "$0";
    } else {
        let html = '';

        const mayoristaRef = precioMayoristaReferencia();
        if (esMayorista) {
            html += `
                <div class="cart-notice is-wholesale">
                    <span class="material-symbols-outlined">loyalty</span>
                    ¡Descuento por volumen activado! ($${mayoristaRef.toLocaleString('es-AR')} c/u)
                </div>`;
        } else {
            html += `
                <div class="cart-notice is-info">
                    Agregá ${MINIMO_MAYORISTA - cantidadTotalItems} unidades más para desbloquear el precio mayorista de $${mayoristaRef.toLocaleString('es-AR')}.
                </div>`;
        }

        carrito.forEach((item, index) => {
            const precioAplicado = precioUnitario(item.code, esMayorista);
            const precioTotalFila = precioAplicado * item.cantidad;
            subtotal += precioTotalFila;

            html += `
                <div class="cart-line">
                    <div>
                        <p class="cart-line-name">${escapeHTML(item.nombre)}</p>
                        <p class="cart-line-unit">$${precioAplicado.toLocaleString('es-AR')} c/u</p>
                    </div>
                    <div class="cart-line-actions">
                        <div class="qty-control">
                            <button data-accion="restar" data-index="${index}">
                                <span class="material-symbols-outlined">remove</span>
                            </button>
                            <span class="qty-value">${item.cantidad}</span>
                            <button data-accion="sumar" data-index="${index}">
                                <span class="material-symbols-outlined">add</span>
                            </button>
                        </div>
                        <p class="cart-line-total">$${precioTotalFila.toLocaleString('es-AR')}</p>
                        <button data-accion="eliminar" data-index="${index}" class="cart-line-remove" title="Eliminar este color">
                            <span class="material-symbols-outlined">delete</span>
                        </button>
                    </div>
                </div>`;
        });

        contenedorItems.innerHTML = html;

        const totalConDescuento = subtotal * 0.90;
        if (cartSub) cartSub.innerText = `$${subtotal.toLocaleString('es-AR')}`;
        if (cartTot) cartTot.innerText = `$${totalConDescuento.toLocaleString('es-AR')}`;
    }

    if (contadorCarrito) contadorCarrito.innerText = cantidadTotalItems;
}

// Delegación de eventos para los botones generados dinámicamente (compatible con CSP)
if (contenedorItems) {
    contenedorItems.addEventListener('click', (evento) => {
        const boton = evento.target.closest('button[data-accion]');
        if (!boton) return;
        const index = parseInt(boton.dataset.index, 10);
        if (isNaN(index) || !carrito[index]) return;

        const accion = boton.dataset.accion;
        if (accion === 'sumar') {
            carrito[index].cantidad = Math.min(carrito[index].cantidad + 1, CANTIDAD_MAXIMA_POR_ITEM);
        } else if (accion === 'restar') {
            carrito[index].cantidad -= 1;
            if (carrito[index].cantidad <= 0) carrito.splice(index, 1);
        } else if (accion === 'eliminar') {
            carrito.splice(index, 1);
        }
        guardarCarrito();
        actualizarVistaCarrito();
    });
}

const botonesAgregar = document.querySelectorAll('.product-card .btn-add');
botonesAgregar.forEach((boton) => {
    boton.addEventListener('click', () => {
        const tarjeta = boton.closest('.product-card');
        const codigo = tarjeta.dataset.code;
        if (!codigo || !codigosEnPagina.has(codigo)) return;

        const prod = catalogo.get(codigo);
        const nombre = prod ? prod.nombre : tarjeta.querySelector('.product-name').innerText.replace('\n', ' ');

        const indexExistente = carrito.findIndex(item => item.code === codigo);
        if (indexExistente !== -1) {
            carrito[indexExistente].cantidad = Math.min(carrito[indexExistente].cantidad + 1, CANTIDAD_MAXIMA_POR_ITEM);
        } else {
            carrito.push({ code: codigo, nombre: nombre, cantidad: 1 });
        }

        guardarCarrito();
        actualizarVistaCarrito();

        const contenidoOriginal = boton.innerHTML;
        boton.innerHTML = `<span class="material-symbols-outlined">check_circle</span> ¡Agregado!`;
        boton.classList.add('is-added');
        setTimeout(() => {
            boton.innerHTML = contenidoOriginal;
            boton.classList.remove('is-added');
        }, 1500);
    });
});

actualizarVistaCarrito();
cargarCatalogo();

// --- 5. LÓGICA DE ENVÍO Y CHECKOUT ---
function cambiarEstiloEnvio() {
    const retiro = document.getElementById('label-retiro');
    const correo = document.getElementById('label-correo');
    const inputEnvio = document.querySelector('input[name="tipo_envio"]:checked');

    if (!inputEnvio || !retiro || !correo) return;

    const seleccion = inputEnvio.value;
    retiro.classList.toggle('is-selected', seleccion === 'Retiro en Paraná');
    correo.classList.toggle('is-selected', seleccion !== 'Retiro en Paraná');
}

document.querySelectorAll('input[name="tipo_envio"]').forEach(radio => {
    radio.addEventListener('change', cambiarEstiloEnvio);
});

// Registra el pedido en el servidor (que valida productos y calcula los precios)
// y abre WhatsApp con el detalle. Los totales del mensaje vienen del servidor.
async function enviarPedido(medioDePago, botonPagar) {
    if (!usuarioLogueado) {
        cerrarCarrito();
        abrirModalCuenta();
        alert("Por favor, iniciá sesión o registrate para poder finalizar tu compra.");
        return;
    }

    if (carrito.length === 0) {
        alert("El carrito está vacío. ¡Agregá unos grips primero!");
        return;
    }

    const inputEnvio = document.querySelector('input[name="tipo_envio"]:checked');
    const tipoEnvioElegido = inputEnvio ? inputEnvio.value : "Retiro en Paraná";

    botonPagar.disabled = true;
    try {
        const { data, error } = await db.rpc('crear_pedido', {
            p_items: carrito.map(item => ({ code: item.code, qty: item.cantidad })),
            p_metodo_envio: tipoEnvioElegido,
            p_metodo_pago: medioDePago
        });

        if (error) {
            if (error.message && error.message.includes("iniciar sesión")) {
                alert("Tu sesión expiró. Iniciá sesión de nuevo para finalizar la compra.");
                abrirModalCuenta();
            } else {
                alert("No pudimos registrar el pedido. Revisá tu conexión e intentá de nuevo.");
            }
            return;
        }

        const pedido = data[0];
        let cantidadTotalItems = carrito.reduce((suma, item) => suma + item.cantidad, 0);
        let esMayorista = cantidadTotalItems >= MINIMO_MAYORISTA;
        const conDescuento = medioDePago === 'transferencia';

        let textoMensaje = "¡Hola Strips Hockey! 🏑\n";
        textoMensaje += `*Pedido N°${pedido.pedido_id}* de la cuenta: ${usuarioLogueado}\n`;
        textoMensaje += `*Entrega:* ${tipoEnvioElegido}\n\n`;

        if (conDescuento) {
            textoMensaje += esMayorista
                ? "Quiero abonar por transferencia (*CANTIDAD MAYORISTA*):\n\n"
                : "Quiero abonar por transferencia (10% OFF):\n\n";
        } else {
            textoMensaje += esMayorista
                ? "Quiero abonar por MercadoPago (*CANTIDAD MAYORISTA*):\n\n"
                : "Quiero abonar por MercadoPago:\n\n";
        }

        carrito.forEach(item => {
            textoMensaje += `- ${item.cantidad}x ${item.nombre}\n`;
        });

        textoMensaje += `\n*Subtotal:* $${Number(pedido.pedido_subtotal).toLocaleString('es-AR')}\n`;
        if (conDescuento) {
            textoMensaje += `*Total a Transferir:* $${Number(pedido.pedido_total).toLocaleString('es-AR')}\n\n`;
            textoMensaje += "Espero los datos de la cuenta para transferir. ¡Gracias!";
        } else {
            textoMensaje += `*Total:* $${Number(pedido.pedido_total).toLocaleString('es-AR')}\n\n`;
            textoMensaje += "Espero el link de pago de MercadoPago para abonar. ¡Gracias!";
        }

        // El pedido quedó registrado: vaciamos el carrito
        carrito = [];
        guardarCarrito();
        actualizarVistaCarrito();
        cerrarCarrito();

        // encodeURIComponent + noopener: evita inyectar parámetros en la URL y que la
        // pestaña nueva pueda manipular esta página
        const url = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(textoMensaje)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
        botonPagar.disabled = false;
    }
}

const btnTransferencia = document.getElementById('btn-transferencia');
if (btnTransferencia) btnTransferencia.addEventListener('click', () => enviarPedido('transferencia', btnTransferencia));

const btnMercadoPago = document.getElementById('btn-mercadopago');
if (btnMercadoPago) btnMercadoPago.addEventListener('click', () => enviarPedido('mercadopago', btnMercadoPago));
