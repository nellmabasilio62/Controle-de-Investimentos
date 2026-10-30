(function () {
  'use strict';

  var CHAVE = 'controle-investimentos-v1';
  var estado = carregar();
  var filtro = 'todos';
  var editandoId = null;

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- Armazenamento ---------- */
  function carregar() {
    try {
      var bruto = localStorage.getItem(CHAVE);
      if (bruto) {
        var dados = JSON.parse(bruto);
        return { moeda: dados.moeda || 'AOA', itens: dados.itens || [] };
      }
    } catch (e) { /* ignora e começa vazio */ }
    return { moeda: 'AOA', itens: [] };
  }

  function guardar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (e) { /* sem espaço */ }
  }

  /* ---------- Cálculos ---------- */
  function numero(v) {
    return (v === null || v === undefined || v === '' || isNaN(v)) ? null : Number(v);
  }

  function valorActual(it) {
    if (it.tipo === 'passivo') return it.investido;
    if (numero(it.atual) !== null) return it.atual;
    if (numero(it.roi) !== null) return it.investido * (1 + it.roi / 100);
    return it.investido;
  }

  function roiDe(it) {

    if (it.tipo === 'passivo') return null;

    if (numero(it.atual) !== null && it.investido > 0) {
      return (it.atual - it.investido) / it.investido * 100;
    }
    if (numero(it.roi) !== null) return it.roi;
    return null;
  }

  function somar(lista, fn) {
    return lista.reduce(function (t, it) { return t + fn(it); }, 0);
  }

  /* ---------- Formatação ---------- */
  function dinheiro(n) {
    try {
      return new Intl.NumberFormat('pt-AO', {
        style: 'currency', currency: estado.moeda, maximumFractionDigits: 2
      }).format(n);
    } catch (e) {
      return n.toFixed(2) + ' ' + estado.moeda;
    }
  }

  function percentagem(n) {
    if (n === null) return '–';
    var sinal = n > 0 ? '+' : '';
    return sinal + n.toFixed(2).replace('.', ',') + '%';
  }

  function dataCurta(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function classeRoi(n) {
    if (n === null || n === 0) return '';
    return n > 0 ? 'ganho' : 'perda';
  }

  function escapar(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var NOMES_TIPO = { ativo: 'Activo', deposito: 'Depósito', passivo: 'Passivo' };

  /* ---------- Desenho ---------- */
  function desenharResumo() {
    var activos = estado.itens.filter(function (i) { return i.tipo === 'ativo'; });
    var depositos = estado.itens.filter(function (i) { return i.tipo === 'deposito'; });
    var passivos = estado.itens.filter(function (i) { return i.tipo === 'passivo'; });

    var totA = somar(activos, valorActual);
    var totD = somar(depositos, valorActual);
    var totP = somar(passivos, valorActual);
    var liquido = totA + totD - totP;

    var elP = $('patrimonio');
    elP.textContent = dinheiro(liquido);
    elP.classList.toggle('negativo', liquido < 0);

    $('totAtivos').textContent = dinheiro(totA);
    $('totDepositos').textContent = dinheiro(totD);
    $('totPassivos').textContent = dinheiro(totP);

    var comRoi = estado.itens.filter(function (i) {
      return i.tipo !== 'passivo' && roiDe(i) !== null && i.investido > 0;
    });
    var elRoi = $('roiMedio');
    if (comRoi.length) {
      var investido = somar(comRoi, function (i) { return i.investido; });
      var ganho = somar(comRoi, function (i) { return valorActual(i) - i.investido; });
      var medio = ganho / investido * 100;
      elRoi.textContent = percentagem(medio);
      elRoi.className = 'numero ' + classeRoi(medio);
    } else {
      elRoi.textContent = '–';
      elRoi.className = 'numero';
    }
  }

  function desenharTabela() {
    var termo = $('pesquisa').value.trim().toLowerCase();
    var lista = estado.itens
      .filter(function (i) { return filtro === 'todos' || i.tipo === filtro; })
      .filter(function (i) {
        if (!termo) return true;
        return (i.nome + ' ' + (i.corretora || '')).toLowerCase().indexOf(termo) !== -1;
      })
      .sort(function (a, b) { return (b.data || '').localeCompare(a.data || ''); });

    $('corpo').innerHTML = lista.map(function (i) {
      var roi = roiDe(i);
      var inicial = i.tipo === 'passivo' ? '–' : dinheiro(i.investido);
      var actual = i.tipo === 'passivo' ? dinheiro(i.investido) : dinheiro(valorActual(i));
      return '<tr>' +
        '<td>' + dataCurta(i.data) + '</td>' +
        '<td class="nome">' + escapar(i.nome) + (i.nota ? '<small>' + escapar(i.nota) + '</small>' : '') + '</td>' +
        '<td><span class="etiqueta ' + i.tipo + '">' + NOMES_TIPO[i.tipo] + '</span></td>' +
        '<td>' + (escapar(i.corretora) || '–') + '</td>' +
        '<td class="num">' + inicial + '</td>' +
        '<td class="num">' + actual + '</td>' +
        '<td class="num ' + classeRoi(roi) + '">' + percentagem(roi) + '</td>' +
        '<td><div class="acoes-linha">' +
          '<button class="mini" data-acao="editar" data-id="' + i.id + '" type="button">Editar</button>' +
          '<button class="mini apagar" data-acao="apagar" data-id="' + i.id + '" type="button">Apagar</button>' +
        '</div></td>' +
        '</tr>';
    }).join('');

    $('vazio').hidden = lista.length > 0;
  }

  function desenharCorretoras() {
    var mapa = {};
    estado.itens.forEach(function (i) {
      if (i.tipo === 'passivo' || !i.corretora) return;
      var c = mapa[i.corretora] || (mapa[i.corretora] = { nome: i.corretora, n: 0, investido: 0, actual: 0 });
      c.n += 1;
      c.investido += i.investido;
      c.actual += valorActual(i);
    });

    var lista = Object.keys(mapa).map(function (k) { return mapa[k]; })
      .sort(function (a, b) { return b.actual - a.actual; });
    var total = somar(lista, function (c) { return c.actual; });

    $('listaCorretoras').innerHTML = lista.map(function (c) {
      var roi = c.investido > 0 ? (c.actual - c.investido) / c.investido * 100 : null;
      var parte = total > 0 ? c.actual / total * 100 : 0;
      return '<li>' +
        '<div class="linha-topo"><span>' + escapar(c.nome) + '</span><span>' + dinheiro(c.actual) + '</span></div>' +
        '<div class="detalhe"><span>' + c.n + (c.n === 1 ? ' registo' : ' registos') + ' · ' + parte.toFixed(0) + '% da carteira</span>' +
        '<span class="' + classeRoi(roi) + '">' + percentagem(roi) + '</span></div>' +
        '<div class="barra"><span style="width:' + parte.toFixed(1) + '%"></span></div>' +
        '</li>';
    }).join('');

    $('vazioCorretoras').hidden = lista.length > 0;

    $('sugestoes').innerHTML = Object.keys(mapa).map(function (k) {
      return '<option value="' + escapar(k) + '"></option>';
    }).join('');
  }

  function desenhar() {
    $('moeda').value = estado.moeda;
    desenharResumo();
    desenharTabela();
    desenharCorretoras();
  }

  /* ---------- Formulário ---------- */
  function ajustarCamposPorTipo() {
    var tipo = $('tipo').value;
    var passivo = tipo === 'passivo';
    $('campoAtual').hidden = passivo;
    $('campoRoi').hidden = passivo;
    $('rotuloCorretora').textContent = passivo ? 'Credor (banco ou entidade)' : 'Corretora';
    $('rotuloInvestido').textContent =
      passivo ? 'Valor em dívida' : (tipo === 'deposito' ? 'Valor depositado' : 'Valor investido');
  }

  function abrirForm(item) {
    editandoId = item ? item.id : null;
    $('tituloForm').textContent = item ? 'Editar registo' : 'Novo registo';
    $('tipo').value = item ? item.tipo : 'ativo';
    $('nome').value = item ? item.nome : '';
    $('corretora').value = item ? (item.corretora || '') : '';
    $('investido').value = item ? item.investido : '';
    $('atual').value = item && numero(item.atual) !== null ? item.atual : '';
    $('roi').value = item && numero(item.roi) !== null ? item.roi : '';
    $('data').value = item ? item.data : new Date().toISOString().slice(0, 10);
    $('nota').value = item ? (item.nota || '') : '';
    ajustarCamposPorTipo();
    $('dialogo').showModal();
    $('nome').focus();
  }

  function guardarForm(ev) {
    ev.preventDefault();
    var tipo = $('tipo').value;
    var registo = {
      id: editandoId || String(Date.now()),
      tipo: tipo,
      nome: $('nome').value.trim(),
      corretora: $('corretora').value.trim(),
      investido: parseFloat($('investido').value),
      atual: tipo === 'passivo' ? null : numero(parseFloat($('atual').value)),
      roi: tipo === 'passivo' ? null : numero(parseFloat($('roi').value)),
      data: $('data').value,
      nota: $('nota').value.trim()
    };
    if (!registo.nome || isNaN(registo.investido)) return;

    if (editandoId) {
      estado.itens = estado.itens.map(function (i) { return i.id === editandoId ? registo : i; });
    } else {
      estado.itens.push(registo);
    }
    guardar();
    $('dialogo').close();
    desenhar();
  }

  /* ---------- Eventos ---------- */
  $('btnNovo').addEventListener('click', function () { abrirForm(null); });
  $('btnCancelar').addEventListener('click', function () { $('dialogo').close(); });
  $('formulario').addEventListener('submit', guardarForm);
  $('tipo').addEventListener('change', ajustarCamposPorTipo);
  $('pesquisa').addEventListener('input', desenharTabela);

  $('moeda').addEventListener('change', function (e) {
    estado.moeda = e.target.value;
    guardar();
    desenhar();
  });

  $('abas').addEventListener('click', function (e) {
    var btn = e.target.closest('.aba');
    if (!btn) return;
    filtro = btn.getAttribute('data-filtro');
    document.querySelectorAll('.aba').forEach(function (a) {
      a.classList.toggle('activa', a === btn);
    });
    desenharTabela();
  });

  $('corpo').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-acao]');
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    var item = estado.itens.filter(function (i) { return i.id === id; })[0];
    if (!item) return;
    if (btn.getAttribute('data-acao') === 'editar') {
      abrirForm(item);
    } else if (confirm('Apagar o registo “' + item.nome + '”?')) {
      estado.itens = estado.itens.filter(function (i) { return i.id !== id; });
      guardar();
      desenhar();
    }
  });

  $('btnExportar').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(estado, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'investimentos.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('btnExemplo').addEventListener('click', function () {
    if (estado.itens.length && !confirm('Adicionar dados de exemplo aos seus registos?')) return;
    var base = Date.now();
    estado.itens = estado.itens.concat([
      { id: 'ex' + base + 1, tipo: 'ativo', nome: 'Acções de tecnologia', corretora: 'XTB', investido: 500000, atual: 585000, roi: null, data: '2026-03-10', nota: 'Exemplo' },
      { id: 'ex' + base + 2, tipo: 'ativo', nome: 'ETF global', corretora: 'eToro', investido: 300000, atual: 291000, roi: null, data: '2026-05-22', nota: 'Exemplo' },
      { id: 'ex' + base + 3, tipo: 'deposito', nome: 'Depósito a prazo', corretora: 'Banco', investido: 800000, atual: null, roi: 6.5, data: '2026-01-15', nota: 'Exemplo' },
      { id: 'ex' + base + 4, tipo: 'passivo', nome: 'Crédito pessoal', corretora: 'Banco', investido: 250000, atual: null, roi: null, data: '2026-02-01', nota: 'Exemplo' }
    ]);
    guardar();
    desenhar();
  });

  desenhar();
})();
