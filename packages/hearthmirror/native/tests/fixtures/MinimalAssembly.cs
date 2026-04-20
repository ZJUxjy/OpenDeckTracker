// Minimal stub assembly for hearthmirror-native metadata reader tests.
// Contains the types and fields needed to exercise token lookup without
// committing a real Assembly-CSharp.dll (EULA / size concerns).
//
// Compile:  dotnet build -c Release  (from the project directory)
// Output:   MinimalAssembly.dll  (~32 KB)

using System.Collections.Generic;

namespace Blizzard.T5.Services
{
    public interface IService { }

    public static class ServiceManager
    {
        public static Dictionary<string, IService> s_runtimeServices =
            new Dictionary<string, IService>();

        public static Dictionary<string, IService> s_dynamicServices =
            new Dictionary<string, IService>();

        public static void RegisterService(string name, IService svc)
        {
            s_runtimeServices[name] = svc;
        }

        public static IService GetService(string name)
        {
            IService svc;
            s_runtimeServices.TryGetValue(name, out svc);
            return svc;
        }
    }
}
