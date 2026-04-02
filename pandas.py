import pandas as pd
import uuid

df = pd.read_excel("ParaChatGpt.xlsx")

def generar_uuid():
    return str(uuid.uuid4())

sql = []

for _, row in df.iterrows():
    contrato_id = generar_uuid()

    numero = str(row['NUMERO DE CONTRATO'])
    objeto = str(row['OBJETO DEL CONTRATO'])
    valor_total = row['VALOR INICIAL DEL CONTRATO'] or 0
    valor_mensual = row['ASIGNACIÓN MENSUAL'] or 0
    fecha_inicio = row['FECHA DEL ACTA DE INICIO']
    fecha_fin = row['FECHA FINALIZACIÓN (PROGRAMADA)']
    plazo_dias = row['PLAZO (DÍAS)'] or 0

    plazo_meses = int(plazo_dias / 30) if plazo_dias else 0

    numero_cdp = str(row['No. CDP']) if pd.notna(row['No. CDP']) else None
    numero_crp = str(row['No. CRP']) if pd.notna(row['No. CRP']) else None

    insert = f"""
    INSERT INTO contratos (
        id, numero, objeto, valor_total, valor_mensual,
        plazo_meses, fecha_inicio, fecha_fin,
        numero_cdp, numero_crp, anio
    ) VALUES (
        '{contrato_id}',
        '{numero}',
        '{objeto.replace("'", "''")}',
        {valor_total},
        {valor_mensual},
        {plazo_meses},
        '{fecha_inicio}',
        '{fecha_fin}',
        {f"'{numero_cdp}'" if numero_cdp else "NULL"},
        {f"'{numero_crp}'" if numero_crp else "NULL"},
        2025
    );
    """

    sql.append(insert)

with open("contratos.sql", "w", encoding="utf-8") as f:
    f.write("\n".join(sql))