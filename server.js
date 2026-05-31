const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurações
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir apenas o painel admin
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// ===== FUNÇÕES AUXILIARES =====
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function lerJSON(arquivo) {
    try {
        const filePath = path.join(DATA_DIR, `${arquivo}.json`);
        if (!fs.existsSync(filePath)) return [];
        const dados = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(dados);
    } catch (error) {
        return [];
    }
}

function escreverJSON(arquivo, dados) {
    try {
        const filePath = path.join(DATA_DIR, `${arquivo}.json`);
        fs.writeFileSync(filePath, JSON.stringify(dados, null, 2));
        return true;
    } catch (error) {
        return false;
    }
}

// ===== AUTENTICAÇÃO =====
const auth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ erro: 'Acesso negado' });
    const token = authHeader.split(' ')[1];
    if (token !== 'AdminPretholas') return res.status(401).json({ erro: 'Token inválido' });
    next();
};

// ===== INICIALIZAR DADOS =====
function inicializarDados() {
    const produtosIniciais = [
        { id: 1, nome: 'Liverpool 25/26', preco: 500, categoria: 'camisas', status: 'ativo', estoque: 10 },
        { id: 2, nome: 'Real Madrid 25/26', preco: 500, categoria: 'camisas', status: 'ativo', estoque: 8 },
        { id: 3, nome: 'Barcelona 25/26', preco: 500, categoria: 'camisas', status: 'ativo', estoque: 12 },
        { id: 4, nome: 'Bola de Futebol', preco: 3500, categoria: 'bolas', status: 'ativo', estoque: 15 },
        { id: 5, nome: 'Chuteira Elite FG', preco: 2500, categoria: 'chuteiras', status: 'ativo', estoque: 7 }
    ];
    
    if (lerJSON('produtos').length === 0) escreverJSON('produtos', produtosIniciais);
    if (lerJSON('pedidos').length === 0) escreverJSON('pedidos', []);
    if (lerJSON('clientes').length === 0) escreverJSON('clientes', []);
    if (lerJSON('pagamentos').length === 0) escreverJSON('pagamentos', []);
}

// ===== ROTAS =====
app.get('/api/teste', (req, res) => {
    res.json({ mensagem: 'Backend Pretholas funcionando! ✅', status: 'online' });
});

app.get('/api/dashboard', auth, (req, res) => {
    const produtos = lerJSON('produtos');
    const pedidos = lerJSON('pedidos');
    const clientes = lerJSON('clientes');
    const totalVendas = pedidos.reduce((s, p) => s + (p.total || 0), 0);
    const pedidosPendentes = pedidos.filter(p => p.status === 'pendente').length;
    const receitaMes = pedidos.filter(p => {
        const data = new Date(p.data);
        const agora = new Date();
        return data.getMonth() === agora.getMonth() && data.getFullYear() === agora.getFullYear();
    }).reduce((s, p) => s + (p.total || 0), 0);
    
    res.json({
        totalVendas,
        pedidosPendentes,
        totalProdutos: produtos.length,
        totalClientes: clientes.length,
        receitaMes
    });
});

// Produtos
app.get('/api/produtos', (req, res) => {
    res.json(lerJSON('produtos'));
});

app.post('/api/produtos', auth, (req, res) => {
    const produtos = lerJSON('produtos');
    const novoId = produtos.length ? Math.max(...produtos.map(p => p.id)) + 1 : 1;
    const novoProduto = { id: novoId, ...req.body, preco: parseFloat(req.body.preco) };
    produtos.push(novoProduto);
    escreverJSON('produtos', produtos);
    res.json({ sucesso: true, produto: novoProduto });
});

app.put('/api/produtos/:id', auth, (req, res) => {
    const produtos = lerJSON('produtos');
    const id = parseInt(req.params.id);
    const index = produtos.findIndex(p => p.id === id);
    if (index === -1) return res.status(404).json({ erro: 'Produto não encontrado' });
    produtos[index] = { ...produtos[index], ...req.body };
    escreverJSON('produtos', produtos);
    res.json({ sucesso: true, produto: produtos[index] });
});

app.delete('/api/produtos/:id', auth, (req, res) => {
    const produtos = lerJSON('produtos');
    const id = parseInt(req.params.id);
    const novosProdutos = produtos.filter(p => p.id !== id);
    escreverJSON('produtos', novosProdutos);
    res.json({ sucesso: true });
});

// Pedidos
app.get('/api/pedidos', auth, (req, res) => {
    const pedidos = lerJSON('pedidos');
    res.json(pedidos.sort((a, b) => new Date(b.data) - new Date(a.data)));
});

app.get('/api/pedidos/pendentes', auth, (req, res) => {
    const pedidos = lerJSON('pedidos');
    res.json(pedidos.filter(p => p.status === 'pendente'));
});

app.post('/api/pedidos', (req, res) => {
    const pedidos = lerJSON('pedidos');
    const clientes = lerJSON('clientes');
    const pagamentos = lerJSON('pagamentos');
    
    const novoPedido = {
        id: Date.now(),
        ...req.body,
        status: 'pendente',
        data: new Date().toISOString()
    };
    pedidos.push(novoPedido);
    escreverJSON('pedidos', pedidos);
    
    // Atualiza cliente
    const clienteExistente = clientes.find(c => c.telefone === req.body.telefone);
    if (clienteExistente) {
        clienteExistente.totalCompras = (clienteExistente.totalCompras || 0) + (req.body.total || 0);
        clienteExistente.ultimaCompra = new Date().toISOString();
        clienteExistente.pedidos = clienteExistente.pedidos || [];
        clienteExistente.pedidos.push(novoPedido.id);
    } else {
        clientes.push({
            id: Date.now(),
            nome: req.body.nome,
            telefone: req.body.telefone,
            totalCompras: req.body.total || 0,
            ultimaCompra: new Date().toISOString(),
            pedidos: [novoPedido.id],
            dataCadastro: new Date().toISOString()
        });
    }
    escreverJSON('clientes', clientes);
    
    // Registra pagamento
    pagamentos.push({
        id: Date.now(),
        pedidoId: novoPedido.id,
        metodo: req.body.metodoPagamento || 'e-Mola',
        valor: req.body.total || 0,
        status: 'pendente',
        mensagemConfirmacao: req.body.mensagemConfirmacao || null,
        data: new Date().toISOString()
    });
    escreverJSON('pagamentos', pagamentos);
    
    res.json({ sucesso: true, pedido: novoPedido });
});

app.put('/api/pedidos/:id/confirmar', auth, (req, res) => {
    const pedidos = lerJSON('pedidos');
    const pagamentos = lerJSON('pagamentos');
    const id = parseInt(req.params.id);
    const pedido = pedidos.find(p => p.id === id);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
    
    pedido.status = 'confirmado';
    pedido.dataConfirmacao = new Date().toISOString();
    escreverJSON('pedidos', pedidos);
    
    const pagamento = pagamentos.find(p => p.pedidoId === id);
    if (pagamento) {
        pagamento.status = 'confirmado';
        pagamento.dataConfirmacao = new Date().toISOString();
        escreverJSON('pagamentos', pagamentos);
    }
    res.json({ sucesso: true });
});

// Clientes
app.get('/api/clientes', auth, (req, res) => {
    const clientes = lerJSON('clientes');
    res.json(clientes.sort((a, b) => (b.totalCompras || 0) - (a.totalCompras || 0)));
});

// Pagamentos
app.get('/api/pagamentos', auth, (req, res) => {
    const pagamentos = lerJSON('pagamentos');
    res.json(pagamentos.sort((a, b) => new Date(b.data) - new Date(a.data)));
});

app.get('/api/pagamentos/pendentes', auth, (req, res) => {
    const pagamentos = lerJSON('pagamentos');
    res.json(pagamentos.filter(p => p.status === 'pendente'));
});

// Inicializar e iniciar
inicializarDados();

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ╔════════════════════════════════════╗
    ║   🚀 PRETHOLAS BACKEND RODANDO     ║
    ╠════════════════════════════════════╣
    ║   📍 Porta: ${PORT}                    ║
    ║   👑 Admin: /admin                  ║
    ║   🔐 Senha: AdminPretholas          ║
    ╚════════════════════════════════════╝
    `);
});
