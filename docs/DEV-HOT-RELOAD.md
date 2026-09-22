# Desenvolvimento com hot reload

O compose de produção usa uma imagem Next.js compilada. Ele é adequado para
release, mas exige rebuild quando o código muda. Para trabalhar no CT sem esse
ciclo, use o override docker-compose.dev.yml.

## Ativar no CT

Na primeira vez:

~~~sh
cd /opt/deskcommcrm
pnpm install --frozen-lockfile
./scripts/dev-stack.sh
~~~

Esse comando troca somente app e worker para o modo de desenvolvimento.
Não recria Waha, Supabase, Redis, Caddy ou scheduler.

## Fluxo diário

Após a ativação, basta editar o código:

- alterações de interface são recarregadas pelo Next.js;
- alterações em lib/agent-engine ou workers/ reiniciam o processo do worker
  pelo tsx watch;
- não é necessário executar docker compose build nem recriar container;
- alterações em package.json exigem pnpm install --frozen-lockfile no CT e
  podem exigir apenas reiniciar app ou worker.

Logs:

~~~sh
cd /opt/deskcommcrm
docker compose \
  -f docker-compose.prod.yml \
  -f docker-compose.supabase-network.yml \
  -f docker-compose.dev.yml \
  logs -f app worker
~~~

## Voltar ao modo de produção

Quando a alteração estiver pronta para validar como release:

~~~sh
docker compose \
  -f docker-compose.prod.yml \
  -f docker-compose.build.yml \
  -f docker-compose.supabase-network.yml \
  up -d --build --no-deps app worker
~~~

O scheduler só precisa ser recriado se os arquivos de cron/scheduler forem
alterados. Os dados persistentes continuam nos serviços e volumes existentes.
