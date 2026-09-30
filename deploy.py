"""
AgroApp — Script de despliegue a Netlify
Sube todos los archivos estáticos usando la API de Netlify
"""
import os
import hashlib
import json
import requests
import zipfile
import io

SITE_DIR = r"c:\Users\Jm4te\Documents\AgroApp"
NETLIFY_API = "https://api.netlify.com/api/v1"

def get_all_files(base_dir):
    """Obtiene todos los archivos del proyecto, excluyendo scripts de deploy"""
    files = {}
    exclude = {'deploy.py', '.git', '__pycache__', 'node_modules'}
    
    for root, dirs, filenames in os.walk(base_dir):
        dirs[:] = [d for d in dirs if d not in exclude]
        for fname in filenames:
            if fname == 'deploy.py':
                continue
            full_path = os.path.join(root, fname)
            rel_path = '/' + os.path.relpath(full_path, base_dir).replace('\\', '/')
            
            with open(full_path, 'rb') as f:
                content = f.read()
            
            sha1 = hashlib.sha1(content).hexdigest()
            files[rel_path] = {
                'sha1': sha1,
                'size': len(content),
                'path': full_path
            }
    
    return files

def create_zip(base_dir):
    """Crea un ZIP en memoria con todos los archivos"""
    zip_buffer = io.BytesIO()
    exclude = {'deploy.py', '.git', '__pycache__', 'node_modules'}
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, filenames in os.walk(base_dir):
            dirs[:] = [d for d in dirs if d not in exclude]
            for fname in filenames:
                if fname == 'deploy.py':
                    continue
                full_path = os.path.join(root, fname)
                arc_name = os.path.relpath(full_path, base_dir)
                zf.write(full_path, arc_name)
    
    zip_buffer.seek(0)
    return zip_buffer

def deploy():
    print("🌽 AgroApp — Desplegando a Netlify...")
    print("=" * 50)
    
    # Crear ZIP
    print("📦 Empaquetando archivos...")
    zip_data = create_zip(SITE_DIR)
    zip_bytes = zip_data.read()
    print(f"   ZIP creado: {len(zip_bytes) / 1024:.1f} KB")
    
    # Crear sitio nuevo en Netlify (sin auth = sitio anónimo)
    print("🚀 Subiendo a Netlify...")
    
    headers = {
        'Content-Type': 'application/zip',
    }
    
    response = requests.post(
        f"{NETLIFY_API}/sites",
        headers=headers,
        data=zip_bytes,
        timeout=60
    )
    
    if response.status_code in (200, 201):
        data = response.json()
        site_url = data.get('ssl_url') or data.get('url') or f"https://{data.get('subdomain')}.netlify.app"
        site_id = data.get('id')
        
        print()
        print("=" * 50)
        print("✅ ¡APP DESPLEGADA EXITOSAMENTE!")
        print("=" * 50)
        print()
        print(f"🔗 URL de tu app: {site_url}")
        print()
        print("📱 PASOS PARA INSTALAR EN TU iPHONE 13:")
        print("-" * 50)
        print(f"1. Abre Safari en tu iPhone")
        print(f"2. Visita: {site_url}")
        print(f"3. Toca el botón de compartir (📤)")
        print(f"4. Toca 'Agregar a pantalla de inicio'")
        print(f"5. Toca 'Agregar'")
        print()
        print("🎉 ¡Listo! AgroApp estará en tu pantalla de inicio")
        print("   como una app nativa, sin barra de Safari.")
        print()
        print(f"📌 Site ID: {site_id}")
        print(f"   (guarda este ID si quieres actualizar la app después)")
        
        return site_url
    else:
        print(f"❌ Error: {response.status_code}")
        print(response.text)
        return None

if __name__ == '__main__':
    deploy()
