// ═══════════════════════════════════════════════════════════
// Lógica do Sistema 
// ═══════════════════════════════════════════════════════════
let solarFactor = 0.75;
let equipments = [];

// ═══════════════════════════════════════════════════════════
// PAINÉIS SOLARES
// ═══════════════════════════════════════════════════════════
function updateSolarFactor(value) {
  solarFactor = value / 100;

  document.getElementById('solar-value').textContent = value + "%";

  // Atualiza eficiência visual dos painéis
  document.getElementById('eff-550').textContent = value + "%";
  document.getElementById('eff-340').textContent = value + "%";

  recalculate();
}
const panels = {
  p550: { name: 'Painel 580W', nominal: 580, voc: 50, isc: 14 },
  p340: { name: 'Painel 340W', nominal: 340, voc: 40, isc: 9.5 },
};
const controllers = {
  intelbras: {
    name: "Intelbras MPPT 60A",
    maxVoc: 100,        // corrigido
    maxCurrent: 60,     // corrigido
    maxPower: {
      12: 800,
      24: 1600,
      48: 3200
    }
  },
  epever: {
    name: "Epever MPPT 40A",
    maxVoc: 100,        // corrigido
    maxCurrent: 40,     // corrigido
    maxPower: {
      12: 600,
      24: 1200,
      48: 2400
    }
  }
};

function verificarControladora(controladora, painel, qtdPaineis, tensaoBanco) {

  if (qtdPaineis === 0) {
    return { compat: true, corrente: 0 };
  }

  // 1️⃣ Limite de série pelo VOC (com margem térmica 20%)
  const vocCorrigido = painel.voc * 1.2;
  const maxSerie = Math.floor(controladora.maxVoc / vocCorrigido);

  if (maxSerie < 1) {
    return { compat: false, motivo: "VOC excede limite" };
  }

  // 2️⃣ Definir arranjo série/paralelo
  const paineisEmSerie = Math.min(maxSerie, qtdPaineis);
  const strings = Math.ceil(qtdPaineis / paineisEmSerie);

  // 3️⃣ Potência total instalada
  const potenciaTotal = painel.nominal * qtdPaineis;

  // 4️⃣ Verificar potência máxima permitida
  const maxPotenciaPermitida = controladora.maxPower[tensaoBanco] || 0;

  if (potenciaTotal > maxPotenciaPermitida) {
    return { compat: false, motivo: "Potência excede limite" };
  }

  // 5️⃣ Corrente de carga no banco
  const correnteCarga = potenciaTotal / tensaoBanco;

  if (correnteCarga > controladora.maxCurrent) {
    return { compat: false, motivo: "Corrente excede limite" };
  }

  return {
    compat: true,
    corrente: correnteCarga.toFixed(1),
    serie: paineisEmSerie,
    paralelo: strings
  };
}
// ═══════════════════════════════════════════════════════════
// CHARTS
// ═══════════════════════════════════════════════════════════

let chartConsumo = null;
let chartBalance = null;

function initCharts() {
  const ctxC = document.getElementById('chartConsumo').getContext('2d');
  chartConsumo = new Chart(ctxC, {
    type: 'doughnut',
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: [
          '#82abeeff','#8b5cf6','#ec4899','#f97316','#22c55e',
          '#eab308','#06b6d4','#f43f5e','#84cc16','#a855f7',
          '#14b8a6','#f59e0b','#6366f1','#10b981'
        ],
        borderColor: '#181b24',
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#94a3b8', font: { size: 11 }, padding: 12 }
        }
      }
    }
  });

  const ctxB = document.getElementById('chartBalance').getContext('2d');
  chartBalance = new Chart(ctxB, {
    type: 'bar',
    data: {
      labels: ['Consumo 24h', 'Produção 580W', 'Produção 340W'],
      datasets: [{
        label: 'Watts/dia',
        data: [0, 0, 0],
        backgroundColor: ['#3b82f6', '#f59e0b', '#eab308'],
        borderColor: ['#2563eb', '#d97706', '#ca8a04'],
        borderWidth: 1,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', font: { size: 11 } },
          grid: { color: 'rgba(42,46,58,0.5)' }
        },
        y: {
          ticks: { color: '#94a3b8', font: { size: 11 } },
          grid: { color: 'rgba(42,46,58,0.3)' }
        }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════
// RENDERIZAR TABELA
// ═══════════════════════════════════════════════════════════

function renderTable() {
  const tbody = document.getElementById('equip-body');
  tbody.innerHTML = '';

  equipments.forEach((eq, i) => {
    const wh = eq.qty * eq.v * eq.a;
    const w24 = wh * 24;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <span class="equip-name">${eq.name}</span>
      </td>
      <td>
        <input type="number" value="${eq.qty}" min="0" max="100"
               onchange="updateEquip(${i}, 'qty', this.value)" style="width:65px;" />
      </td>
      <td>
        <input type="number" value="${eq.v}" min="0" step="0.1"
               onchange="updateEquip(${i}, 'v', this.value)" style="width:75px;" />
      </td>
      <td>
        <input type="number" value="${eq.a}" min="0" step="0.01"
               onchange="updateEquip(${i}, 'a', this.value)" style="width:75px;" />
      </td>
      <td><span class="calc-value">${wh.toFixed(1)}</span></td>
      <td><span class="calc-value ${w24 > 0 ? 'green' : ''}">${w24.toFixed(1)}</span></td>
      <td><button class="btn-danger" onclick="removeEquip(${i})">✕</button></td>
    `;
    tbody.appendChild(tr);
  });

  recalculate();
}

function updateEquip(index, field, value) {
  equipments[index][field] = parseFloat(value) || 0;
  renderTable();
}

function removeEquip(index) {
  equipments.splice(index, 1);
  renderTable();
}

function addEquipment() {
  const name = document.getElementById('new-name').value.trim();
  if (!name) return;

  equipments.push({
    name: name,
    qty: parseFloat(document.getElementById('new-qty').value) || 1,
    v: parseFloat(document.getElementById('new-v').value) || 12,
    a: parseFloat(document.getElementById('new-a').value) || 0.5,
    special: null,
  });
  document.getElementById('new-name').value = '';
  renderTable();
}

// ═══════════════════════════════════════════════════════════
// RECALCULAR TUDO
// ═══════════════════════════════════════════════════════════

function recalculate() {
  const hasDCDC = parseInt(document.getElementById('conv-dcdc').value);
  const hasACDC = parseInt(document.getElementById('conv-acdc').value);
  const tensaoBanco = parseInt(document.getElementById('cfg-tensao').value);
  const autonomia = parseFloat(document.getElementById('cfg-autonomia').value) || 12;
  const insolacao = parseFloat(document.getElementById('cfg-insolacao').value) || 5;

  // 1. Consumo base dos equipamentos
  let consumoBase24 = 0;
  const consumoPerEquip = [];

  equipments.forEach(eq => {
    const w24 = eq.qty * eq.v * eq.a * 24;
    consumoBase24 += w24;
    if (w24 > 0) {
      consumoPerEquip.push({ name: eq.name, value: w24 });
    }
  });

  // 2. Adicionar overhead dos conversores
  let consumoTotal24 = consumoBase24;
  if (hasACDC) consumoTotal24 += consumoBase24 * 0.11;
  if (hasDCDC) consumoTotal24 += consumoBase24 * 0.05;

  // 3. Produção solar
const prod550 = panels.p550.nominal * solarFactor * insolacao;
const prod340 = panels.p340.nominal * solarFactor * insolacao;

  document.getElementById('prod-550').textContent = prod550.toLocaleString('pt-BR') + ' W';
  document.getElementById('prod-340').textContent = prod340.toLocaleString('pt-BR') + ' W';

  // 4. Banco requerido baterias
  const bancoReqChumbo = (autonomia / 24) * consumoTotal24 / 0.5;
  const bancoReqLitio = Math.floor((autonomia / 24) * consumoTotal24 / 0.9);

  // 5. Quantidade de baterias
  const batQty115 = bancoReqChumbo > 0 ? Math.ceil(bancoReqChumbo / (115 * 12 * 0.4)) : 0;
  const batQtyLitio = bancoReqLitio > 0 ? Math.ceil(bancoReqLitio / (100 * 48)) : 0;
  const batQty60 = bancoReqChumbo > 0 ? Math.ceil(bancoReqChumbo / (60 * 12 * 0.4)) : 0;

  // Banco útil
  const bancoUtil115 = batQty115 * 12 * 115 * 0.4;
  const bancoUtilLitio = batQtyLitio * 48 * 100 * 0.92;
  const bancoUtil60 = batQty60 * 12 * 60 * 0.4;

 // 6. Painéis necessários
const totalDemanda = consumoTotal24 + bancoReqLitio;
const paineis550 = totalDemanda > 0 ? Math.ceil(totalDemanda / prod550) : 0;
const paineis340 = totalDemanda > 0 ? Math.ceil(totalDemanda / prod340) : 0;

// Corrente média do sistema
const correnteSistema = (consumoTotal24 / 24) / tensaoBanco;

// 7. CONTROLADORA (LÓGICA CORRETA)

function verificarControladora(controladora, painel, qtdPaineis, tensaoBanco) {

  if (qtdPaineis === 0) {
    return { compat: true, corrente: 0 };
  }

  const vocCorrigido = painel.voc * 1.2;
  const maxSerie = Math.floor(controladora.maxVoc / vocCorrigido);

    const potenciaTotal = painel.nominal * qtdPaineis;
    const correnteCarga = potenciaTotal / tensaoBanco;
    const maxPotenciaPermitida = controladora.maxCurrent * tensaoBanco;

  let compat = true;
  let motivo = "";

  if (maxSerie < 1) {
    compat = false;
    motivo = "VOC excede limite";
  }

  if (potenciaTotal > maxPotenciaPermitida) {
    compat = false;
    motivo = "Potência excede limite";
  }

  if (correnteCarga > controladora.maxCurrent) {
    compat = false;
    motivo = "Corrente excede limite";
  }

  return {
    compat: compat,
    motivo: motivo,
    corrente: correnteCarga.toFixed(1),
    potenciaTotal: potenciaTotal,
    vocString: vocCorrigido
  };
}
document.getElementById('res-corrente').textContent =
  correnteSistema.toFixed(1);
// 7. CONTROLADORAS

const ctrlIntelbras = verificarControladora(
  controllers.intelbras,
  panels.p550,
  paineis550,
  tensaoBanco
);

const ctrlEpever = verificarControladora(
  controllers.epever,
  panels.p340,
  paineis340,
  tensaoBanco
);
document.getElementById('res-corrente').textContent =
  correnteSistema.toFixed(1);

document.getElementById('res-tensao').textContent =
  tensaoBanco;
// Extrair dados
const ctrlIntCompat = ctrlIntelbras.compat;
const ctrlEpCompat = ctrlEpever.compat;
const ctrlIntAh = ctrlIntelbras.corrente || 0;
  // ═══════ ATUALIZAR UI ═══════

  document.getElementById('res-consumo').textContent = consumoTotal24.toFixed(1);
  document.getElementById('res-paineis550').textContent = paineis550;
  document.getElementById('res-paineis340').textContent = paineis340;
  document.getElementById('res-litio').textContent = batQtyLitio;
  document.getElementById('res-115').textContent = batQty115;

  document.getElementById('need-550').textContent = paineis550;
  document.getElementById('need-340').textContent = paineis340;

  document.getElementById('bat-req-115').textContent = bancoReqChumbo.toFixed(1) + ' W';
  document.getElementById('bat-util-115').textContent = bancoUtil115.toFixed(1) + ' W';
  document.getElementById('need-bat-115').textContent = batQty115;

  
  document.getElementById('bat-req-litio').textContent = bancoReqLitio.toFixed(0) + ' W';
  document.getElementById('bat-util-litio').textContent = bancoUtilLitio.toFixed(1) + ' W';
  document.getElementById('need-bat-litio').textContent = batQtyLitio;

  document.getElementById('bat-req-60').textContent = bancoReqChumbo.toFixed(1) + ' W';
  document.getElementById('bat-util-60').textContent = bancoUtil60.toFixed(1) + ' W';
  document.getElementById('need-bat-60').textContent = batQty60;

  document.getElementById('ctrl-int-ah').textContent = ctrlIntAh;
  document.getElementById('ctrl-int-compat').innerHTML = ctrlIntCompat
    ? '<span class="badge badge-yes">✓ Sim</span>'
    : '<span class="badge badge-no">✕ Não</span>';
  document.getElementById('ctrl-ep-compat').innerHTML = ctrlEpCompat
    ? '<span class="badge badge-yes">✓ Sim</span>'
    : '<span class="badge badge-no">✕ Não</span>';

  // Cor da borda da controladora
  document.getElementById('ctrl-intelbras-card').style.borderColor =
    ctrlIntCompat ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)';
  document.getElementById('ctrl-epever-card').style.borderColor =
    ctrlEpCompat ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)';

  // ═══════ ATUALIZAR GRÁFICOS ═══════

// 🔵 Gráfico de Consumo (fixo, independente do solarFactor)
if (chartConsumo) {

  const consumoFixado = equipments.map(eq => ({
    name: eq.name,
    value: eq.qty * eq.v * eq.a * 24
  }));

  chartConsumo.data.labels = consumoFixado.map(e => e.name);
  chartConsumo.data.datasets[0].data = consumoFixado.map(e => e.value);

  chartConsumo.update();
}

// 🟡 Gráfico de Produção vs Consumo (esse depende do solarFactor)
if (chartBalance) {
  chartBalance.data.datasets[0].data = [
    consumoTotal24,
    prod550 * paineis550,
    prod340 * paineis340
  ];
  chartBalance.update();
}}
// ═══════════════════════════════════════════════════════════
// INICIALIZAR
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function () {
  initCharts();
  renderTable();
});