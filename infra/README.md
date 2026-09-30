# Infraestructura (Terraform + Azure)

Todo lo que corre en Azure está escrito acá. Nadie crea recursos a mano en el portal:
si hay que cambiar algo, se cambia el código y se abre un PR.

```
infra/
├── bootstrap/preparar-azure.sh   # se corre una sola vez, a mano, en Azure Cloud Shell
├── main.tf                       # logs, ambiente de Container Apps, Postgres y las dos apps
├── modules/app/                  # una Container App (frontend + backend en la misma revisión)
└── tests/infra.tftest.hcl        # `terraform test`: revisa el plan sin conectarse a Azure
```

## Qué se crea

| Recurso | Para qué |
|---------|----------|
| `lafueguina-staging` y `lafueguina-produccion` (Container Apps) | La app. Cada una tiene su dirección `https://…azurecontainerapps.io`. Staging se apaga sola cuando nadie la usa. |
| `lafueguina-db-xxxxx` (PostgreSQL Flexible Server, B1ms) | Un servidor con dos bases: `staging` y `produccion`. Backup diario, 7 días. |
| `lafueguina-apps` (ambiente de Container Apps) | Donde corren las dos apps. |
| `lafueguina-logs` (Log Analytics) | Los logs de las apps, 30 días. |

Las contraseñas (Postgres, firma de sesiones, primer admin) las genera Terraform y quedan como
secretos de cada app. La del admin se ve en el portal: la app → **Secretos** → `admin-password`.

## Puesta en marcha (una sola vez)

1. **Cuenta:** activar [Azure for Students](https://azure.microsoft.com/free/students) con el mail de la facultad.
2. **Preparar Azure:** en [portal.azure.com](https://portal.azure.com), abrir Cloud Shell (el ícono `>_` de arriba, elegir *Bash*) y pegar:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/JoaquinLista/panaderia-gestion/main/infra/bootstrap/preparar-azure.sh | bash
   ```
   Usa Chile Central (la región más cerca que permiten las cuentas de estudiante). Para ver
   qué regiones permite la cuenta: `az policy assignment list --disable-scope-strict-match --query "[].parameters" -o json`,
   y para usar otra: `UBICACION=northcentralus` antes de `bash`. Si el script se corta, se puede volver a correr.
3. **Variables en GitHub:** *Settings → Secrets and variables → Actions → Variables*: cargar las cuatro que imprime el script (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `TFSTATE_CUENTA`).
4. **Ambientes en GitHub:** *Settings → Environments*: crear `infra`, `staging` y `produccion`. En `infra` y `produccion`, tildar *Required reviewers* y agregarse como aprobador.
5. **Crear todo:** *Actions → Infra → Run workflow*, y aprobar el job cuando lo pida.

## Día a día

- Un PR que toca `infra/` muestra el plan como comentario: qué se va a crear, cambiar o borrar.
- Al mergearlo, el job **Terraform · apply** espera la aprobación del ambiente `infra`.
- La versión de la app que corre no la maneja Terraform sino el workflow de despliegue (Sprint 6, PR 3).

## Probar en la compu

```bash
cd infra
terraform init -backend=false
terraform fmt -check -recursive
terraform validate
terraform test
tflint --init && tflint --recursive
```
